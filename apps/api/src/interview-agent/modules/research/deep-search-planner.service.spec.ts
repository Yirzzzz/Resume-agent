import { DeepSearchPlannerService } from './deep-search-planner.service';
import type { InterviewAgentSessionDoc } from '../../types/interview-agent.types';

describe('DeepSearchPlannerService', () => {
  it('creates a five-tier degradation plan ending in explicit synthesis', () => {
    const planner = new DeepSearchPlannerService();
    const session = {
      input: {
        company: '字节跳动',
        position: '大模型算法工程师',
      },
    } as InterviewAgentSessionDoc;

    const plan = planner.createPlan(session);

    expect(plan.map((step) => step.tier)).toEqual([
      'TARGET_COMPANY_TARGET_ROLE',
      'TARGET_COMPANY_SIMILAR_ROLE',
      'SIMILAR_COMPANY_TARGET_ROLE',
      'GENERIC_ROLE',
      'AGENT_SYNTHESIZED',
    ]);
    expect(plan[0].searchDepth).toBe('deep');
    expect(plan[4].reason).toContain('显式合成');
  });
});
