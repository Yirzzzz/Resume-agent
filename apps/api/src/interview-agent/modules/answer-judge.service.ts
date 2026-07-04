import { Injectable } from '@nestjs/common';
import { judgeSchema } from '../schemas/judge.schema';
import type { JudgeOutput } from '../schemas/judge.schema';
import { buildAnswerJudgePrompt } from '../prompts/answer-judge.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type {
  InterviewClaim,
  InterviewAgentSessionDoc,
  InterviewTurn,
  JudgeResult,
} from '../types/interview-agent.types';

@Injectable()
export class AnswerJudgeService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async judge(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    answerText: string,
    claims: InterviewClaim[] = [],
    budget?: LlmBudget,
  ): Promise<JudgeResult> {
    const { system, prompt } = buildAnswerJudgePrompt({
      session,
      turn,
      answerText,
      activeClaims: claims,
    });
    const output = await this.structured.callStructured<JudgeOutput>({
      system,
      prompt,
      schema: judgeSchema,
      promptVersion: promptVersions.answerJudge,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'answer_judge_llm',
          summary: event.ok
            ? '回答多维评审完成'
            : `评审生成失败（${event.error ?? event.attempt}）`,
          from: 'AnswerJudge',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const result = this.sanitize(session, turn, claims, output);
    this.trace.push(session, {
      step: 'judge_verdict',
      summary: '本轮回答评审完成，移交策略决策',
      from: 'AnswerJudge',
      to: 'NextActionPolicy',
      inputSummary: {
        turnId: turn.turnId,
        scores: result.scores,
        informationGain: result.informationGain,
        evidenceGapCount: result.evidenceGaps.length,
        contradictionCount: result.contradictions.length,
      },
    });
    return result;
  }

  /** LLM 输出经过 schema 后仍需业务校验：id 必须真实存在，数值 clamp。 */
  private sanitize(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    claims: InterviewClaim[],
    output: JudgeOutput,
  ): JudgeResult {
    const knownClaimIds = new Set([
      ...claims.map((c) => c.id),
      ...session.memory.claims.map((c) => c.id),
    ]);
    const knownCompetencyIds = new Set(
      (session.jdMatrix?.competencies ?? []).map((c) => c.id),
    );
    const clampScore = (value: number) => Math.max(1, Math.min(5, Math.round(value)));
    const scores = Object.fromEntries(
      Object.entries(output.scores).map(([key, value]) => [key, clampScore(value)]),
    ) as JudgeResult['scores'];

    return {
      scores,
      informationGain: output.informationGain,
      evidenceGaps: output.evidenceGaps.filter((gap) => knownClaimIds.has(gap.claimId)),
      contradictions: output.contradictions.filter((row) =>
        knownClaimIds.has(row.claimId),
      ),
      competencyUpdates: output.competencyUpdates
        .filter((update) => knownCompetencyIds.has(update.competencyId))
        .map((update) => ({
          competencyId: update.competencyId,
          scoreDelta: Math.max(-1.5, Math.min(1.5, update.scoreDelta)),
          confidenceDelta: Math.max(-0.4, Math.min(0.4, update.confidenceDelta)),
          evidenceTurnId: turn.turnId,
        })),
      reasoning: output.reasoning,
    };
  }
}
