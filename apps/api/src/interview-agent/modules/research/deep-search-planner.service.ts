import { Injectable } from '@nestjs/common';
import type { SearchDepth } from '../../../interview-search/types/interview-search.types';
import type {
  InterviewAgentSessionDoc,
  SourceTier,
} from '../../types/interview-agent.types';

export interface DeepSearchPlanStep {
  tier: SourceTier;
  searchDepth: SearchDepth;
  reason: string;
}

@Injectable()
export class DeepSearchPlannerService {
  createPlan(session: InterviewAgentSessionDoc): DeepSearchPlanStep[] {
    const company = session.input.company.trim();
    const position = session.input.position.trim();
    return [
      {
        tier: 'TARGET_COMPANY_TARGET_ROLE',
        searchDepth: 'deep',
        reason: company && position ? '优先检索目标公司+目标岗位面经' : '公司或岗位缺失，仍按最精确条件尝试',
      },
      {
        tier: 'TARGET_COMPANY_SIMILAR_ROLE',
        searchDepth: 'standard',
        reason: '目标公司同技术方向相似岗位补充',
      },
      {
        tier: 'SIMILAR_COMPANY_TARGET_ROLE',
        searchDepth: 'standard',
        reason: '同类公司目标岗位补充题型风格',
      },
      {
        tier: 'GENERIC_ROLE',
        searchDepth: 'quick',
        reason: '岗位通用高质量面经兜底',
      },
      {
        tier: 'AGENT_SYNTHESIZED',
        searchDepth: 'quick',
        reason: '预算耗尽或外部结果不足时显式合成补齐',
      },
    ];
  }
}
