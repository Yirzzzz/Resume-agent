import { Injectable } from '@nestjs/common';
import { interviewerTurnSchema, openingSchema } from '../schemas/interviewer.schema';
import type { InterviewerTurnOutput } from '../schemas/interviewer.schema';
import {
  buildInterviewerTurnPrompt,
  buildOpeningPrompt,
} from '../prompts/interviewer.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type {
  InterviewAgentSessionDoc,
  InterviewTurn,
  MainQuestion,
  PolicyDecision,
} from '../types/interview-agent.types';

export interface ComposedTurn {
  acknowledgement: string;
  nextQuestion: string | null;
}

@Injectable()
export class InterviewerService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async opening(
    session: InterviewAgentSessionDoc,
    firstQuestion: string,
    budget?: LlmBudget,
  ): Promise<string> {
    const { system, prompt } = buildOpeningPrompt({ session, firstQuestion });
    const output = await this.structured.callStructured({
      system,
      prompt,
      schema: openingSchema,
      promptVersion: promptVersions.interviewer,
      budget,
      temperature: 0.5,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'interviewer_opening_llm',
          summary: event.ok
            ? '开场白生成完成'
            : `开场白生成失败（${event.error ?? event.attempt}）`,
          from: 'Interviewer',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });
    // 开场白必须带出第一题，LLM 偶尔会漏
    return output.opening.includes(firstQuestion.slice(0, 12))
      ? output.opening
      : `${output.opening} 第一题：${firstQuestion}`;
  }

  /**
   * 按决策生成「衔接语 + 下一问」，一次 LLM 调用同时产出两者。
   * END_INTERVIEW 只返回收尾状态文案（不生成面试内容，无需 LLM）。
   */
  async composeTurn(params: {
    session: InterviewAgentSessionDoc;
    answeredTurn: InterviewTurn;
    answerText: string;
    decision: PolicyDecision;
    nextMainQuestion?: MainQuestion;
    budget?: LlmBudget;
  }): Promise<ComposedTurn> {
    const { session, answeredTurn, answerText, decision, nextMainQuestion, budget } =
      params;

    if (decision.action === 'END_INTERVIEW') {
      return {
        acknowledgement: '好，这轮模拟面试到这里结束，我来整理复盘报告。',
        nextQuestion: null,
      };
    }

    const targetClaimContent = decision.targetClaimId
      ? session.memory.claims.find((c) => c.id === decision.targetClaimId)?.content
      : undefined;
    const { system, prompt } = buildInterviewerTurnPrompt({
      session,
      answeredTurn,
      answerText,
      decision,
      nextMainQuestion,
      targetClaimContent,
    });
    const output = await this.structured.callStructured<InterviewerTurnOutput>({
      system,
      prompt,
      schema: interviewerTurnSchema,
      promptVersion: promptVersions.interviewer,
      budget,
      temperature: 0.5,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'interviewer_turn_llm',
          summary: event.ok
            ? '面试官回应与下一问生成完成'
            : `下一问生成失败（${event.error ?? event.attempt}）`,
          from: 'Interviewer',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    // SWITCH_TOPIC/ASK_MAIN 时问题必须仍锚定规划的主问题考察点，防止 LLM 跑偏换题
    let nextQuestion = output.nextQuestion;
    if (
      (decision.action === 'SWITCH_TOPIC' || decision.action === 'ASK_MAIN') &&
      nextMainQuestion &&
      !this.sharesAnchor(nextQuestion, nextMainQuestion.question)
    ) {
      nextQuestion = nextMainQuestion.question;
    }

    this.trace.push(session, {
      step: 'interviewer_next_question',
      summary: `面试官发出下一问（${decision.action}）`,
      from: 'Interviewer',
      to: 'Candidate',
      inputSummary: { quotedFromAnswer: output.quotedFromAnswer },
    });
    return { acknowledgement: output.acknowledgement, nextQuestion };
  }

  chooseNextMainQuestion(
    session: InterviewAgentSessionDoc,
  ): MainQuestion | undefined {
    const asked = new Set(
      session.turns
        .filter((turn) => turn.questionSource === 'plan_pool')
        .map((turn) => turn.mainQuestionId),
    );
    const covered = new Set(session.memory.session.coveredCompetencyIds);
    const pool = session.plan?.mainQuestionPool ?? [];
    return (
      pool.find(
        (question) =>
          question.competencyIds.some((id) => !covered.has(id)) &&
          !asked.has(question.id),
      ) ?? pool.find((question) => !asked.has(question.id))
    );
  }

  /** 粗略判断 LLM 输出的问题是否仍锚定主问题（共享足够的关键词） */
  private sharesAnchor(generated: string, planned: string): boolean {
    const tokens = planned
      .replace(/[，。！？、,.!?\s]/g, ' ')
      .split(' ')
      .filter((t) => t.length >= 2);
    if (tokens.length === 0) return true;
    const hit = tokens.filter((t) => generated.includes(t)).length;
    return hit / tokens.length >= 0.25;
  }
}
