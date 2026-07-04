import { Injectable, NotFoundException } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  InterviewAgentSessionDoc,
  SanitizedResume,
  SessionInput,
} from '../types/interview-agent.types';

function resolveDataRoot(): string {
  const normalized = process.cwd().replace(/\\/g, '/');
  if (normalized.endsWith('/apps/api')) {
    return join(process.cwd(), '..', '..', 'data', 'interview-agent');
  }
  return join(process.cwd(), 'data', 'interview-agent');
}

@Injectable()
export class SessionStoreService {
  private readonly root = resolveDataRoot();
  private readonly sessionsDir = join(this.root, 'sessions');

  create(input: SessionInput, resumeSnapshot: SanitizedResume): InterviewAgentSessionDoc {
    const now = new Date().toISOString();
    const session: InterviewAgentSessionDoc = {
      version: 1,
      sessionId: this.newId('ia'),
      status: 'CREATED',
      input,
      resumeSnapshot,
      memory: {
        session: {
          questionCount: 0,
          lowInformationStreak: 0,
          coveredCompetencyIds: [],
          followUpDepth: 0,
        },
        claims: [],
        competencies: [],
        unresolvedIssues: [],
      },
      turns: [],
      trace: [],
      usage: {
        llmCalls: 0,
        searchCalls: 0,
        pageReads: 0,
        promptTokens: 0,
        completionTokens: 0,
        startedAt: now,
        updatedAt: now,
      },
    };
    this.save(session);
    return session;
  }

  get(sessionId: string): InterviewAgentSessionDoc {
    const path = this.sessionPath(sessionId);
    if (!existsSync(path)) {
      throw new NotFoundException(`Interview agent session ${sessionId} not found`);
    }
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as InterviewAgentSessionDoc;
    } catch {
      throw new NotFoundException(
        `Interview agent session ${sessionId} is corrupted`,
      );
    }
  }

  save(session: InterviewAgentSessionDoc): InterviewAgentSessionDoc {
    mkdirSync(dirname(this.sessionPath(session.sessionId)), { recursive: true });
    session.usage.updatedAt = new Date().toISOString();
    const finalPath = this.sessionPath(session.sessionId);
    const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf-8');
    renameSync(tmpPath, finalPath);
    return session;
  }

  private sessionPath(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    return join(this.sessionsDir, `${safe}.json`);
  }

  private newId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }
}
