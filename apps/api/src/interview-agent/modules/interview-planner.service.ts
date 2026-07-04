import { Injectable } from '@nestjs/common';
import { interviewAgentConfig } from '../config/interview-agent.config';
import { interviewPlanSchema } from '../schemas/interview-plan.schema';
import type { InterviewPlanOutput } from '../schemas/interview-plan.schema';
import { buildPlannerPrompt } from '../prompts/interview-planner.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import type {
  InterviewAgentSessionDoc,
  InterviewPlan,
  MainQuestion,
} from '../types/interview-agent.types';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type { PlanReviewerService } from './plan-reviewer.service';

@Injectable()
export class InterviewPlannerService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  /**
   * 生成计划并通过质检：LLM 出题 → 代码质检 → 不合格带反馈重写（≤2 次）→ 兜底补齐。
   */
  async createReviewedPlan(
    session: InterviewAgentSessionDoc,
    budget: LlmBudget | undefined,
    reviewer: PlanReviewerService,
  ): Promise<InterviewPlan> {
    let plan = await this.createPlan(session, budget);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const verdict = reviewer.check(session, plan);
      if (verdict.pass) break;
      this.trace.push(session, {
        step: 'plan_review_rejected',
        summary: `计划质检未通过（第 ${attempt} 次）：${verdict.feedback}`,
        from: 'PlanReviewer',
        to: 'InterviewPlanner',
      });
      plan = await this.createPlan(session, budget, verdict.feedback);
    }
    return reviewer.finalize(session, plan);
  }

  async createPlan(
    session: InterviewAgentSessionDoc,
    budget?: LlmBudget,
    reviewFeedback?: string,
  ): Promise<InterviewPlan> {
    const jd = session.jdMatrix;
    const resume = session.resumeAnalysis;
    const research = session.research;
    if (!jd || !resume || !research) {
      throw new Error('prepare artifacts are incomplete');
    }

    const { system, prompt } = buildPlannerPrompt({ session, reviewFeedback });
    const output = await this.structured.callStructured<InterviewPlanOutput>({
      system,
      prompt,
      schema: interviewPlanSchema,
      promptVersion: promptVersions.interviewPlanner,
      budget,
      temperature: 0.4,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'interview_planner_llm',
          summary: event.ok
            ? '面试计划（主问题池）生成完成'
            : `计划生成生成失败（${event.error ?? event.attempt}）`,
          from: 'InterviewPlanner',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const plan = this.sanitize(session, output);
    this.trace.push(session, {
      step: 'interview_plan_created',
      summary: `生成 ${plan.mainQuestionPool.length} 个主问题候选，送质检`,
      from: 'InterviewPlanner',
      to: 'PlanReviewer',
      inputSummary: {
        focusProjects: plan.focusProjects,
        highRiskClaims: plan.highRiskClaims,
        difficultyDistribution: plan.difficultyDistribution,
      },
    });
    return plan;
  }

  /** LLM 输出后处理：引用 id 必须真实存在，stopConditions 由代码强制，id 去重 */
  private sanitize(
    session: InterviewAgentSessionDoc,
    output: InterviewPlanOutput,
  ): InterviewPlan {
    const knownCompetencyIds = new Set(
      (session.jdMatrix?.competencies ?? []).map((c) => c.id),
    );
    const knownProjectIds = new Set(
      (session.resumeAnalysis?.projects ?? []).map((p) => p.id),
    );
    const knownClaimIds = new Set(
      (session.resumeAnalysis?.claimsToVerify ?? []).map((c) => c.id),
    );
    const knownSourceIds = new Set(
      (session.research?.sources ?? []).map((s) => s.id),
    );

    const seenIds = new Set<string>();
    const pool: MainQuestion[] = [];
    for (const question of output.mainQuestionPool) {
      const id = seenIds.has(question.id)
        ? `main_${pool.length + 1}_dedup`
        : question.id;
      seenIds.add(id);
      const competencyIds = question.competencyIds.filter((cid) =>
        knownCompetencyIds.has(cid),
      );
      pool.push({
        ...question,
        id,
        competencyIds: competencyIds.length
          ? competencyIds
          : [...knownCompetencyIds].slice(0, 1),
        targetProjectId:
          question.targetProjectId && knownProjectIds.has(question.targetProjectId)
            ? question.targetProjectId
            : undefined,
        targetClaimIds: question.targetClaimIds.filter((cid) =>
          knownClaimIds.has(cid),
        ),
        styleEvidence: question.styleEvidence.filter((sid) =>
          knownSourceIds.has(sid),
        ),
      });
    }

    return {
      competencyPriorities: output.competencyPriorities.filter((row) =>
        knownCompetencyIds.has(row.competencyId),
      ),
      focusProjects: output.focusProjects.filter((id) => knownProjectIds.has(id)),
      highRiskClaims: output.highRiskClaims.filter((id) => knownClaimIds.has(id)),
      mainQuestionPool: pool.slice(0, Math.max(session.input.maxQuestions * 2, 8)),
      difficultyDistribution: output.difficultyDistribution,
      stopConditions: {
        maxQuestions: session.input.maxQuestions,
        maxFollowUpPerQuestion: interviewAgentConfig.maxFollowUpPerQuestion,
        coverageThreshold: interviewAgentConfig.coverageThreshold,
      },
    };
  }

}
