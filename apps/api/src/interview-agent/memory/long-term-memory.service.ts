import { Injectable, NotFoundException } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { longTermExtractionSchema } from '../schemas/long-term-memory.schema';
import type { LongTermExtractionOutput } from '../schemas/long-term-memory.schema';
import { buildLongTermMemoryPrompt } from '../prompts/long-term-memory.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type {
  InterviewAgentSessionDoc,
  InterviewReport,
  LongTermMemoryDoc,
  LongTermMemoryEntry,
} from '../types/interview-agent.types';

function resolveDataRoot(): string {
  const normalized = process.cwd().replace(/\\/g, '/');
  if (normalized.endsWith('/apps/api')) {
    return join(process.cwd(), '..', '..', 'data', 'interview-agent');
  }
  return join(process.cwd(), 'data', 'interview-agent');
}

@Injectable()
export class LongTermMemoryService {
  private readonly storePath = join(resolveDataRoot(), 'long-term-memory.json');

  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  list(resumeFileId?: string): LongTermMemoryEntry[] {
    const doc = this.read();
    return doc.entries
      .filter((entry) => !resumeFileId || entry.resumeFileId === resumeFileId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  delete(entryId: string): { deletedId: string } {
    const doc = this.read();
    const before = doc.entries.length;
    doc.entries = doc.entries.filter((entry) => entry.id !== entryId);
    if (doc.entries.length === before) {
      throw new NotFoundException(`Long-term memory ${entryId} not found`);
    }
    this.write(doc);
    return { deletedId: entryId };
  }

  async extractFromSession(
    session: InterviewAgentSessionDoc,
    report: InterviewReport,
    budget?: LlmBudget,
  ): Promise<LongTermMemoryEntry[]> {
    const existingDoc = this.read();
    const existingForResume = existingDoc.entries.filter(
      (entry) => entry.resumeFileId === session.input.resumeFileId,
    );
    const { system, prompt } = buildLongTermMemoryPrompt({
      session,
      report,
      existingEntries: existingForResume,
    });
    const extraction = await this.structured.callStructured<LongTermExtractionOutput>({
      system,
      prompt,
      schema: longTermExtractionSchema,
      promptVersion: promptVersions.longTermMemory,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'long_term_memory_llm',
          summary: event.ok
            ? '长期记忆提炼完成'
            : `长期记忆提炼失败（${event.error ?? event.attempt}）`,
          from: 'LongTermMemory',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const candidates = extraction.entries;
    if (candidates.length === 0) return [];
    const doc = this.read();
    const now = new Date().toISOString();
    const changed: LongTermMemoryEntry[] = [];

    for (const candidate of candidates) {
      const existing = doc.entries.find(
        (entry) =>
          entry.resumeFileId === session.input.resumeFileId &&
          entry.kind === candidate.kind &&
          this.normalize(entry.conclusion) === this.normalize(candidate.conclusion),
      );
      if (existing) {
        if (!existing.evidenceSessionIds.includes(session.sessionId)) {
          existing.occurrences += 1;
          existing.evidenceSessionIds.push(session.sessionId);
        }
        existing.lastSeenAt = now;
        changed.push(existing);
      } else {
        const entry: LongTermMemoryEntry = {
          id: `ltm_${Math.random().toString(36).slice(2, 10)}`,
          resumeFileId: session.input.resumeFileId,
          kind: candidate.kind,
          conclusion: candidate.conclusion,
          evidenceSessionIds: [session.sessionId],
          occurrences: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        };
        doc.entries.push(entry);
        changed.push(entry);
      }
    }

    this.write(doc);
    return changed;
  }

  private read(): LongTermMemoryDoc {
    if (!existsSync(this.storePath)) return { version: 1, entries: [] };
    try {
      const raw = JSON.parse(readFileSync(this.storePath, 'utf-8')) as Partial<LongTermMemoryDoc>;
      return {
        version: 1,
        entries: Array.isArray(raw.entries)
          ? raw.entries.filter((entry): entry is LongTermMemoryEntry =>
              Boolean(entry && entry.id && entry.resumeFileId && entry.kind),
            )
          : [],
      };
    } catch {
      return { version: 1, entries: [] };
    }
  }

  private write(doc: LongTermMemoryDoc) {
    mkdirSync(dirname(this.storePath), { recursive: true });
    const tmp = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf-8');
    renameSync(tmp, this.storePath);
  }

  private normalize(input: string): string {
    return input.replace(/\s+/g, '').toLowerCase();
  }
}
