import type {
  InterviewAction,
  InterviewAgentSessionDoc,
  InterviewTurn,
  JudgeResult,
} from '../types/interview-agent.types';

export function buildPolicyPrompt(params: {
  session: InterviewAgentSessionDoc;
  turn: InterviewTurn;
  judge: JudgeResult;
  allowedActions: InterviewAction[];
}): { system: string; prompt: string } {
  const { session, turn, judge, allowedActions } = params;
  const openIssues = session.memory.unresolvedIssues
    .filter((i) => !i.resolvedAtTurnId)
    .slice(0, 8)
    .map((i) => ({ kind: i.kind, description: i.description, claimId: i.relatedClaimId }));
  const unverifiedImportant = session.memory.claims
    .filter((c) => c.status === 'UNVERIFIED' || c.status === 'PARTIALLY_VERIFIED')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8)
    .map((c) => ({ id: c.id, content: c.content, status: c.status, importance: c.importance }));
  const coverage = session.memory.competencies.map((c) => ({
    competencyId: c.competencyId,
    score: c.score,
    confidence: c.confidence,
  }));

  return {
    system:
      '你是面试策略决策器，只输出合法 JSON。你只能从 allowedActions 给出的动作集合中选择——' +
      '这个集合已经被硬规则裁剪过，选集合之外的动作会被系统拒绝。你的目标是在有限的问题数内最大化对候选人真实能力的信息增益。',
    prompt: JSON.stringify(
      {
        task: '基于本轮评价和会话记忆，在 allowedActions 内选择下一步动作。',
        decisionGuidelines: [
          '高重要性 Claim 证据缺口未补齐 → 优先 FOLLOW_UP（strategy=EVIDENCE/IMPLEMENTATION/OWNERSHIP）',
          '回答证据充分但方案合理性可疑 → CHALLENGE（strategy=RATIONALE/COUNTERFACTUAL）',
          '检测到矛盾且尚未澄清 → CLARIFY_CONTRADICTION，targetClaimId 指向矛盾 Claim',
          '当前话题信息增益已经边际递减 → SWITCH_TOPIC 覆盖低置信度能力点',
          '追问要选信息收益最大的一个目标，不要贪多',
          'targetClaimId 必须来自 unverifiedImportantClaims 或 contradictions 中的 id',
        ],
        outputShape: {
          action: 'FOLLOW_UP',
          strategy: 'EVIDENCE',
          targetClaimId: 'claim_x（可省略）',
          reason: '选择依据',
        },
        allowedActions,
        mode: session.input.mode,
        currentTurn: {
          followUpDepth: turn.followUpDepth,
          informationGain: judge.informationGain,
          evidenceGaps: judge.evidenceGaps,
          contradictions: judge.contradictions,
          scores: judge.scores,
        },
        progress: {
          questionCount: session.memory.session.questionCount,
          maxQuestions:
            session.plan?.stopConditions.maxQuestions ?? session.input.maxQuestions,
          coveredCompetencyIds: session.memory.session.coveredCompetencyIds,
        },
        competencyCoverage: coverage,
        openIssues,
        unverifiedImportantClaims: unverifiedImportant,
      },
      null,
      2,
    ),
  };
}
