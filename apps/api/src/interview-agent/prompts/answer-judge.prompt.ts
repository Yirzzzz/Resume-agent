import type {
  InterviewAgentSessionDoc,
  InterviewClaim,
  InterviewTurn,
} from '../types/interview-agent.types';

export function buildAnswerJudgePrompt(params: {
  session: InterviewAgentSessionDoc;
  turn: InterviewTurn;
  answerText: string;
  activeClaims: InterviewClaim[];
}): { system: string; prompt: string } {
  const { session, turn, answerText, activeClaims } = params;
  const main = session.plan?.mainQuestionPool.find(
    (q) => q.id === turn.mainQuestionId,
  );
  const competencies = (session.jdMatrix?.competencies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
  }));
  const recentTurns = session.turns
    .filter((t) => t.answerText && t.turnId !== turn.turnId)
    .slice(-4)
    .map((t) => ({
      turnId: t.turnId,
      question: t.question,
      answerExcerpt: String(t.answerText).slice(0, 300),
    }));

  return {
    system:
      '你是严格的技术面试评审官。你只输出合法 JSON。你的评分必须基于回答文本中可指认的证据，禁止客气分；' +
      '发现回答与简历或历史陈述矛盾时必须如实标记。reasoning 中必须引用具体表述而不是空泛评价。',
    prompt: JSON.stringify(
      {
        task: '对候选人本轮回答做多维评价（1-5 分）、信息量判定、证据缺口识别、矛盾检测和能力分调整。',
        rules: [
          'scores 各维度 1-5：5=有可验证细节且严谨，3=方向对但证据不足，1=空泛或错误',
          'informationGain：回答给面试官带来了多少新的、可评估的信息',
          'evidenceGaps：activeClaims 里哪些断言仍缺少 baseline/指标口径/个人职责边界等证据；claimId 必须来自 activeClaims',
          'contradictions：回答与 activeClaims 或 recentTurns 中的表述冲突时列出；claimId 必须来自 activeClaims',
          'competencyUpdates：只更新与本回答真正相关的能力点；competencyId 必须来自 competencies 列表',
          'reasoning：2-4 句，必须引用回答中的原文片段作为依据',
        ],
        outputShape: {
          scores: {
            technicalAccuracy: 3,
            depth: 3,
            implementationDetail: 3,
            evidenceSufficiency: 2,
            experimentRigor: 2,
            rationality: 3,
            jdRelevance: 4,
            logic: 3,
            ownershipClarity: 4,
          },
          informationGain: 'medium',
          evidenceGaps: [{ claimId: 'claim_x', missing: '缺少什么证据' }],
          contradictions: [
            { claimId: 'claim_x', conflictsWith: '冲突的表述', description: '矛盾说明' },
          ],
          competencyUpdates: [
            { competencyId: 'comp_x', scoreDelta: 0.4, confidenceDelta: 0.2 },
          ],
          reasoning: '引用回答原文的评审依据',
        },
        interviewContext: {
          position: session.input.position,
          company: session.input.company,
          mode: session.input.mode,
          question: turn.question,
          questionObjective: main?.objective,
          rubric: main?.rubric,
        },
        competencies,
        activeClaims: activeClaims.map((c) => ({
          id: c.id,
          content: c.content,
          status: c.status,
        })),
        recentTurns,
        candidateAnswer: answerText,
      },
      null,
      2,
    ),
  };
}
