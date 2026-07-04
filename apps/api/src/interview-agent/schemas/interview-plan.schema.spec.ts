import { interviewPlanSchema } from './interview-plan.schema';

describe('interviewPlanSchema', () => {
  it('normalizes nullable optional ids from OpenAI-compatible providers', () => {
    const parsed = interviewPlanSchema.parse({
      competencyPriorities: [
        { competencyId: 'comp_1', priority: 5, targetQuestionCount: 2 },
      ],
      focusProjects: null,
      highRiskClaims: null,
      mainQuestionPool: [
        {
          id: 'main_1',
          question: '请讲一下缓存一致性方案。',
          competencyIds: ['comp_1'],
          targetProjectId: null,
          targetClaimIds: null,
          objective: '验证工程设计能力',
          followUpDirections: ['IMPLEMENTATION'],
          difficulty: 'medium',
          rubric: [{ level: 'good', signal: '能说明数据流和失败处理' }],
          styleEvidence: null,
        },
      ],
      difficultyDistribution: { easy: 0.2, medium: 0.6, hard: 0.2 },
      stopConditions: {
        maxQuestions: 6,
        maxFollowUpPerQuestion: 2,
        coverageThreshold: 0.8,
      },
    });

    expect(parsed.focusProjects).toEqual([]);
    expect(parsed.highRiskClaims).toEqual([]);
    expect(parsed.mainQuestionPool[0].targetProjectId).toBeUndefined();
    expect(parsed.mainQuestionPool[0].targetClaimIds).toEqual([]);
    expect(parsed.mainQuestionPool[0].styleEvidence).toEqual([]);
  });
});

