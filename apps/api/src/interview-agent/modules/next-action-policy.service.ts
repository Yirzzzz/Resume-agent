import { Injectable } from '@nestjs/common';
import { policyChoiceSchema } from '../schemas/policy.schema';
import type { PolicyChoiceOutput } from '../schemas/policy.schema';
import { buildPolicyPrompt } from '../prompts/next-action-policy.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { AgentTraceService } from '../tracing/agent-trace.service';
import type {
  InterviewAction,
  InterviewAgentSessionDoc,
  InterviewTurn,
  JudgeResult,
  PolicyDecision,
} from '../types/interview-agent.types';

@Injectable()
export class NextActionPolicyService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async decide(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    judge: JudgeResult,
    budget?: LlmBudget,
  ): Promise<PolicyDecision> {
    // ---------- 第一层：硬规则（代码强制，LLM 不可越过） ----------
    const forced = this.hardRules(session, turn, judge);
    if (forced) {
      this.trace.push(session, {
        step: 'policy_hard_rule',
        summary: `硬规则 ${forced.ruleTriggered} 直接决定动作 ${forced.action}`,
        from: 'NextActionPolicy',
        to: 'Interviewer',
        inputSummary: { reason: forced.reason },
      });
      return forced;
    }

    const allowedActions = this.allowedActions(session, turn, judge);
    const bannedClaimIds = this.bannedClaimIds(session);

    // 集合被裁剪到只剩一个动作时无需 LLM
    if (allowedActions.length === 1) {
      const decision = this.clampToLegal(judge, allowedActions, bannedClaimIds);
      decision.ruleTriggered = 'SINGLE_ALLOWED_ACTION';
      return decision;
    }

    // ---------- 第二层：LLM 在合法动作集内选择 ----------
    const { system, prompt } = buildPolicyPrompt({
      session,
      turn,
      judge,
      allowedActions,
    });
    const choice = await this.structured.callStructured<PolicyChoiceOutput>({
      system,
      prompt,
      schema: policyChoiceSchema,
      promptVersion: promptVersions.nextActionPolicy,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'policy_llm',
          summary: event.ok
            ? '策略 LLM 在合法动作集内完成选择'
            : `策略选择生成失败（${event.error ?? event.attempt}）`,
          from: 'NextActionPolicy',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const decision = this.validateChoice(
      session,
      turn,
      judge,
      choice,
      allowedActions,
      bannedClaimIds,
    );
    this.trace.push(session, {
      step: 'policy_decided',
      summary: `策略决定：${decision.action}${decision.strategy ? `/${decision.strategy}` : ''}，移交面试官生成下一问`,
      from: 'NextActionPolicy',
      to: 'Interviewer',
      inputSummary: {
        reason: decision.reason,
        targetClaimId: decision.targetClaimId,
        ruleTriggered: decision.ruleTriggered,
      },
    });
    return decision;
  }

  // ---------- 硬规则 ----------

  private hardRules(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    judge: JudgeResult,
  ): PolicyDecision | null {
    const maxQuestions =
      session.plan?.stopConditions.maxQuestions ?? session.input.maxQuestions;
    const maxFollowUp = session.plan?.stopConditions.maxFollowUpPerQuestion ?? 2;

    if (session.memory.session.questionCount >= maxQuestions) {
      return {
        action: 'END_INTERVIEW',
        reason: `已达到最大问题数 ${maxQuestions}`,
        ruleTriggered: 'MAX_QUESTION_COUNT',
      };
    }

    if (turn.followUpDepth >= maxFollowUp) {
      return {
        action: 'SWITCH_TOPIC',
        reason: `当前主问题追问深度 ${turn.followUpDepth} 已达到上限 ${maxFollowUp}`,
        ruleTriggered: 'MAX_FOLLOWUP_DEPTH',
      };
    }

    if (session.memory.session.lowInformationStreak >= 2) {
      return {
        action: 'SWITCH_TOPIC',
        reason: '连续低信息量回答，切换主题提高信息收益',
        ruleTriggered: 'LOW_INFORMATION_STREAK',
      };
    }

    const totalCompetencies = session.jdMatrix?.competencies.length ?? 0;
    const coverage =
      totalCompetencies > 0
        ? session.memory.session.coveredCompetencyIds.length / totalCompetencies
        : 0;
    const threshold = session.plan?.stopConditions.coverageThreshold ?? 0.8;
    if (
      session.memory.session.questionCount >= 3 &&
      coverage >= threshold &&
      judge.informationGain === 'high' &&
      judge.evidenceGaps.length === 0 &&
      judge.contradictions.length === 0
    ) {
      return {
        action: 'END_INTERVIEW',
        reason: `核心能力覆盖率 ${coverage.toFixed(2)} 已达到阈值 ${threshold}`,
        ruleTriggered: 'COVERAGE_THRESHOLD_REACHED',
      };
    }

    return null;
  }

  private allowedActions(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    judge: JudgeResult,
  ): InterviewAction[] {
    const actions: InterviewAction[] = ['FOLLOW_UP', 'CHALLENGE', 'SWITCH_TOPIC'];
    if (judge.contradictions.length > 0) actions.unshift('CLARIFY_CONTRADICTION');
    return actions;
  }

  /** 同一 Claim 已被连续追问 2 次 → 禁止再作为追问目标 */
  private bannedClaimIds(session: InterviewAgentSessionDoc): Set<string> {
    const banned = new Set<string>();
    const counts = new Map<string, number>();
    for (const turn of session.turns) {
      const target = turn.decision?.targetClaimId;
      if (!target || !turn.answerText) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
      if ((counts.get(target) ?? 0) >= 2) banned.add(target);
    }
    return banned;
  }

  private validateChoice(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    judge: JudgeResult,
    choice: PolicyChoiceOutput,
    allowedActions: InterviewAction[],
    bannedClaimIds: Set<string>,
  ): PolicyDecision {
    const knownClaimIds = new Set(session.memory.claims.map((c) => c.id));
    const invalidAction = !allowedActions.includes(choice.action);
    const invalidTarget =
      choice.targetClaimId !== undefined &&
      (!knownClaimIds.has(choice.targetClaimId) ||
        bannedClaimIds.has(choice.targetClaimId));

    if (invalidAction || invalidTarget) {
      const clamped = this.clampToLegal(judge, allowedActions, bannedClaimIds);
      clamped.ruleTriggered = invalidAction
        ? 'LLM_ACTION_OUT_OF_SET'
        : 'LLM_TARGET_CLAIM_INVALID';
      clamped.reason = `${choice.reason}（原选择越界，已钳制到合法动作集）`;
      return clamped;
    }

    return {
      action: choice.action,
      strategy:
        choice.strategy ??
        (choice.action === 'FOLLOW_UP'
          ? 'EVIDENCE'
          : choice.action === 'CHALLENGE'
            ? 'RATIONALE'
            : choice.action === 'CLARIFY_CONTRADICTION'
              ? 'CONTRADICTION'
              : undefined),
      targetClaimId: choice.targetClaimId,
      targetCompetencyId: choice.targetCompetencyId,
      reason: choice.reason,
    };
  }

  /**
   * 控制层钳制：只负责把决策收敛到合法动作/合法目标，不生成任何面试内容。
   * 追问的问题文本仍由 Interviewer 的 LLM 生成。
   */
  private clampToLegal(
    judge: JudgeResult,
    allowedActions: InterviewAction[],
    bannedClaimIds: Set<string>,
  ): PolicyDecision {
    const action = allowedActions[0];
    const usableGap = judge.evidenceGaps.find(
      (gap) => !bannedClaimIds.has(gap.claimId),
    );
    const strategy =
      action === 'CLARIFY_CONTRADICTION'
        ? ('CONTRADICTION' as const)
        : action === 'CHALLENGE'
          ? ('RATIONALE' as const)
          : action === 'FOLLOW_UP'
            ? ('EVIDENCE' as const)
            : undefined;
    return {
      action,
      strategy,
      targetClaimId:
        action === 'CLARIFY_CONTRADICTION'
          ? judge.contradictions[0]?.claimId
          : usableGap?.claimId,
      reason:
        action === 'CLARIFY_CONTRADICTION'
          ? (judge.contradictions[0]?.description ?? '存在待澄清矛盾')
          : (usableGap?.missing ?? '在合法动作集内收敛'),
    };
  }
}
