import { Injectable } from '@nestjs/common';
import {
  InterviewSearchInput,
  JdProfile,
  SearchQuery,
  SearchRound,
} from './types/interview-search.types';

@Injectable()
export class SearchPlannerService {
  createInitialRound(input: InterviewSearchInput, profile: JdProfile): SearchRound {
    const max = this.maxQueries(input.searchDepth);
    const queries: SearchQuery[] = [];

    const push = (query: string, intent: string, priority: number, platform?: SearchQuery['platform']) => {
      if (!query.trim()) return;
      queries.push({ query: query.trim(), intent, priority, platform });
    };

    // 1) 公司精确面经
    push(`${input.company} ${input.position} 面经`, '公司精确面经', 100);
    push(`${input.company} ${input.position} 一面 二面`, '公司轮次信息', 98);
    push(`site:nowcoder.com ${input.company} ${input.position} 面经`, '牛客平台面经', 96, 'nowcoder');
    push(`site:zhihu.com ${input.company} ${input.position} 面试`, '知乎面经', 95, 'zhihu');
    push(`site:xiaohongshu.com ${input.company} ${input.position} 面经`, '小红书面经', 94, 'xiaohongshu');

    // 2) 岗位泛化面经
    push(`${profile.roleType} 面经`, '岗位泛化面经', 85);
    push(`${profile.roleType} 实习 面试题`, '岗位实习题型', 84);
    profile.roleAliases.slice(0, 3).forEach((alias, i) => {
      push(`${alias} 面试`, '岗位别名补充', 80 - i);
    });

    // 3) 技术专题
    profile.technicalKeywords.slice(0, 8).forEach((keyword, i) => {
      push(`${keyword} 面试题`, '技术专题面试题', 70 - i, 'general');
      if (i < 4) {
        push(`${keyword} ${profile.roleType} 面试`, '技术+岗位交叉', 66 - i, 'general');
      }
    });

    // 4) 平台限定
    push(`site:csdn.net ${input.company} ${input.position} 面试`, 'CSDN 面经', 60, 'csdn');
    push(`site:github.com ${input.company} ${input.position} interview`, 'GitHub 讨论', 58, 'github');
    push(`site:xiaohongshu.com ${profile.roleType} 面经`, '小红书岗位面经', 57, 'xiaohongshu');

    const unique = this.uniqueQueries(queries)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, max);

    return {
      round: 1,
      strategy: 'company_exact',
      queries: unique,
      reason: '首轮优先公司精确面经，其次岗位泛化与技术专题覆盖。',
    };
  }

  private uniqueQueries(queries: SearchQuery[]): SearchQuery[] {
    const seen = new Set<string>();
    const out: SearchQuery[] = [];
    for (const q of queries) {
      const key = q.query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
    }
    return out;
  }

  private maxQueries(depth: InterviewSearchInput['searchDepth']): number {
    if (depth === 'quick') return 12;
    if (depth === 'standard') return 20;
    return 30;
  }
}
