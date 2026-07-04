import { Injectable } from '@nestjs/common';
import { claimExtractionSchema } from '../schemas/claim-extraction.schema';
import type { ClaimExtractionOutput } from '../schemas/claim-extraction.schema';
import { buildClaimExtractorPrompt } from '../prompts/claim-extractor.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type {
  InterviewAgentSessionDoc,
  InterviewClaim,
  InterviewTurn,
} from '../types/interview-agent.types';

@Injectable()
export class ClaimExtractorService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async extractAndMerge(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    answerText: string,
    budget?: LlmBudget,
  ): Promise<InterviewClaim[]> {
    const { system, prompt } = buildClaimExtractorPrompt({
      session,
      turn,
      answerText,
    });
    const extraction = await this.structured.callStructured<ClaimExtractionOutput>({
      system,
      prompt,
      schema: claimExtractionSchema,
      promptVersion: promptVersions.claimExtractor,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'claim_extractor_llm',
          summary: event.ok
            ? 'Claim 语义抽取完成'
            : `Claim 抽取失败（${event.error ?? event.attempt}）`,
          from: 'ClaimExtractor',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const claims = this.merge(session, turn, extraction);
    this.linkSeededClaims(session, turn, claims);
    turn.extractedClaimIds = [...new Set(claims.map((claim) => claim.id))];
    this.trace.push(session, {
      step: 'claims_merged',
      summary: `本轮共 ${claims.length} 条 Claim（新建/更新后），移交评审`,
      from: 'ClaimExtractor',
      to: 'AnswerJudge',
      inputSummary: { claimIds: turn.extractedClaimIds },
    });
    return claims;
  }

  private merge(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    extraction: ClaimExtractionOutput,
  ): InterviewClaim[] {
    const mainQuestion = session.plan?.mainQuestionPool.find(
      (question) => question.id === turn.mainQuestionId,
    );
    const merged: InterviewClaim[] = [];
    for (const candidate of extraction.claims) {
      const existing = this.resolveExisting(session, candidate);
      if (existing) {
        if (!existing.sourceTurnIds.includes(turn.turnId)) {
          existing.sourceTurnIds.push(turn.turnId);
        }
        existing.importance = Math.max(existing.importance, candidate.importance);
        merged.push(existing);
        continue;
      }
      const claim: InterviewClaim = {
        id: this.newId('claim'),
        content: candidate.content,
        status: 'UNVERIFIED',
        sourceTurnIds: [turn.turnId],
        relatedProjectId: mainQuestion?.targetProjectId,
        relatedCompetencyIds: mainQuestion?.competencyIds ?? [],
        importance: Math.round(candidate.importance),
      };
      session.memory.claims.push(claim);
      merged.push(claim);
    }
    return merged;
  }

  private resolveExisting(
    session: InterviewAgentSessionDoc,
    candidate: ClaimExtractionOutput['claims'][number],
  ): InterviewClaim | undefined {
    if (candidate.matchesExistingClaimId) {
      const byId = session.memory.claims.find(
        (claim) => claim.id === candidate.matchesExistingClaimId,
      );
      if (byId) return byId;
    }
    const normalized = this.normalize(candidate.content);
    return session.memory.claims.find((claim) => {
      const claimText = this.normalize(claim.content);
      return (
        claimText === normalized ||
        (claimText.length >= 14 &&
          normalized.length >= 14 &&
          (claimText.includes(normalized) || normalized.includes(claimText)))
      );
    });
  }

  private linkSeededClaims(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    claims: InterviewClaim[],
  ) {
    const mainQuestion = session.plan?.mainQuestionPool.find(
      (question) => question.id === turn.mainQuestionId,
    );
    for (const claimId of mainQuestion?.targetClaimIds ?? []) {
      const seeded = session.memory.claims.find((claim) => claim.id === claimId);
      if (!seeded) continue;
      if (!seeded.sourceTurnIds.includes(turn.turnId)) {
        seeded.sourceTurnIds.push(turn.turnId);
      }
      if (!claims.includes(seeded)) claims.push(seeded);
    }
  }

  private normalize(input: string): string {
    return input.replace(/\s+/g, '').replace(/[，。,.：:；;]/g, '').toLowerCase();
  }

  private newId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
