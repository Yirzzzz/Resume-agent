import { Injectable } from '@nestjs/common';
import { reportSchema } from '../schemas/report.schema';
import type { ReportOutput } from '../schemas/report.schema';
import { buildReportPrompt } from '../prompts/report-generator.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type {
  InterviewAgentSessionDoc,
  InterviewReport,
} from '../types/interview-agent.types';

@Injectable()
export class ReportGeneratorService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  /**
   * 报告 = 确定性证据骨架（代码统计，永远可追溯）+ LLM 叙事层（summary/strengths/weaknesses）。
   * LLM 不可用时抛错（调用方可稍后重试 getReport），不用规则文案伪造评价。
   */
  async generate(
    session: InterviewAgentSessionDoc,
    budget?: LlmBudget,
  ): Promise<InterviewReport> {
    const skeleton = this.buildSkeleton(session);
    const answeredTurns = session.turns.filter((turn) => turn.answerText);
    if (answeredTurns.length === 0) {
      return {
        ...skeleton,
        summary: '本轮没有已回答的问题，未生成评价。',
        strengths: [],
        weaknesses: [],
      };
    }

    const { system, prompt } = buildReportPrompt({ session });
    const narrative = await this.structured.callStructured<ReportOutput>({
      system,
      prompt,
      schema: reportSchema,
      promptVersion: promptVersions.reportGenerator,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'report_llm',
          summary: event.ok
            ? '复盘报告叙事层生成完成'
            : `报告叙事生成失败（${event.error ?? event.attempt}）`,
          from: 'ReportGenerator',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const knownTurnIds = new Set(session.turns.map((t) => t.turnId));
    const knownClaimIds = new Set(session.memory.claims.map((c) => c.id));
    const llmEvidenceLinks = narrative.evidenceLinks.filter(
      (link) =>
        (link.turnId && knownTurnIds.has(link.turnId)) ||
        (link.claimId && knownClaimIds.has(link.claimId)),
    );

    return {
      ...skeleton,
      summary: narrative.summary,
      strengths: narrative.strengths,
      weaknesses: narrative.weaknesses,
      evidenceLinks: [...llmEvidenceLinks, ...skeleton.evidenceLinks],
    };
  }

  /** 确定性证据骨架：全部由代码统计生成，不经过 LLM */
  private buildSkeleton(
    session: InterviewAgentSessionDoc,
  ): InterviewReport {
    const answeredTurns = session.turns.filter((turn) => turn.answerText);
    return {
      summary: '',
      strengths: [],
      weaknesses: [],
      evidenceLinks: this.evidenceLinks(session),
      competencySummary: session.memory.competencies.map((memory) => ({
        competencyId: memory.competencyId,
        name: this.competencyName(session, memory.competencyId),
        score: Number(memory.score.toFixed(2)),
        confidence: Number(memory.confidence.toFixed(2)),
        evidenceTurnIds: memory.evidenceTurnIds,
      })),
      claimSummary: session.memory.claims.map((claim) => ({
        claimId: claim.id,
        status: claim.status,
        content: claim.content,
        evidenceTurnIds: claim.sourceTurnIds,
        relatedCompetencyIds: claim.relatedCompetencyIds,
      })),
      unresolvedIssues: session.memory.unresolvedIssues.map((issue) => ({
        issueId: issue.id,
        kind: issue.kind,
        description: issue.description,
        relatedClaimId: issue.relatedClaimId,
        openedAtTurnId: issue.openedAtTurnId,
        resolvedAtTurnId: issue.resolvedAtTurnId,
      })),
      turnEvidence: answeredTurns.map((turn) => ({
        turnId: turn.turnId,
        question: turn.question,
        answerExcerpt: String(turn.answerText ?? '').slice(0, 120),
        action: turn.decision?.action,
        informationGain: turn.judge?.informationGain,
        claimIds: turn.extractedClaimIds,
      })),
    };
  }

  private evidenceLinks(
    session: InterviewAgentSessionDoc,
  ): InterviewReport['evidenceLinks'] {
    const links: InterviewReport['evidenceLinks'] = [];
    for (const turn of session.turns.filter((item) => item.answerText)) {
      links.push({
        turnId: turn.turnId,
        note: `informationGain=${turn.judge?.informationGain ?? 'unknown'}, action=${turn.decision?.action ?? 'none'}`,
      });
      for (const claimId of turn.extractedClaimIds) {
        links.push({
          turnId: turn.turnId,
          claimId,
          note: `claim evidence from turn ${turn.index}`,
        });
      }
    }
    return links;
  }

  private competencyName(
    session: InterviewAgentSessionDoc,
    competencyId: string,
  ): string {
    return (
      session.jdMatrix?.competencies.find((item) => item.id === competencyId)
        ?.name ?? competencyId
    );
  }
}
