import type { InterviewAgentSessionDoc } from '../types/interview-agent.types';

export function buildPlannerPrompt(params: {
  session: InterviewAgentSessionDoc;
  reviewFeedback?: string;
}): { system: string; prompt: string } {
  const { session, reviewFeedback } = params;
  const research = session.research;
  return {
    system:
      '你是面试出题规划师，只输出合法 JSON。你为一场针对性的模拟面试设计主问题池：' +
      '题目必须同时锚定三件事——公司真实面试风格（styleProfile/researchQuestions）、JD 能力矩阵、候选人简历的具体项目与攻击面。' +
      '通用模板题（脱离简历也能问的题）价值最低，除非风格画像显示该公司爱考八股。',
    prompt: JSON.stringify(
      {
        task: '生成 InterviewPlan。mainQuestionPool 出 8-12 题。',
        rules: [
          '每题 id 用 main_1..n；competencyIds 只能来自 jdCompetencies 的 id；targetProjectId 只能来自 resumeProjects 的 id；targetClaimIds 只能来自 claimsToVerify 的 id',
          '至少一半的题必须落到具体项目（targetProjectId 非空），并针对 attackSurface 设计 followUpDirections',
          '面经研究里的高频题型要转化成结合候选人简历的版本，styleEvidence 填支撑该题的 source id',
          'rubric 的 signal 必须可执行：面试官听到什么样的回答算 excellent/good/weak',
          'difficultyDistribution 与 styleProfile.technicalDepth 一致',
          `stopConditions 固定为 ${JSON.stringify(session.plan?.stopConditions ?? { maxQuestions: session.input.maxQuestions, maxFollowUpPerQuestion: 2, coverageThreshold: 0.8 })}`,
          reviewFeedback ? `上一版计划质检未通过，必须修复：${reviewFeedback}` : '',
        ].filter(Boolean),
        outputShape: {
          competencyPriorities: [
            { competencyId: 'comp_x', priority: 5, targetQuestionCount: 2 },
          ],
          focusProjects: ['project_1'],
          highRiskClaims: ['claim_1'],
          mainQuestionPool: [
            {
              id: 'main_1',
              question: '完整题目文本',
              competencyIds: ['comp_x'],
              targetProjectId: 'project_1',
              targetClaimIds: ['claim_1'],
              objective: '考察目标',
              followUpDirections: ['EVIDENCE', 'IMPLEMENTATION'],
              difficulty: 'medium',
              rubric: [
                { level: 'excellent', signal: '优秀回答的可观察信号' },
                { level: 'good', signal: '合格信号' },
                { level: 'weak', signal: '薄弱信号' },
              ],
              styleEvidence: ['source_1'],
            },
          ],
          difficultyDistribution: { easy: 0.2, medium: 0.55, hard: 0.25 },
          stopConditions: { maxQuestions: 8, maxFollowUpPerQuestion: 2, coverageThreshold: 0.8 },
        },
        company: session.input.company,
        position: session.input.position,
        round: session.input.interviewRound,
        jdCompetencies: session.jdMatrix?.competencies ?? [],
        resumeProjects: session.resumeAnalysis?.projects ?? [],
        attackSurface: session.resumeAnalysis?.attackSurface ?? [],
        claimsToVerify: session.resumeAnalysis?.claimsToVerify ?? [],
        styleProfile: research?.styleProfile,
        researchQuestions: (research?.extractedQuestions ?? []).slice(0, 40),
      },
      null,
      2,
    ),
  };
}
