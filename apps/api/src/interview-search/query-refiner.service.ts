import { Injectable } from '@nestjs/common';
import {
  CoverageResult,
  InterviewSearchInput,
  JdProfile,
  SearchQuery,
} from './types/interview-search.types';

@Injectable()
export class QueryRefinerService {
  refine(
    input: InterviewSearchInput,
    profile: JdProfile,
    coverage: CoverageResult,
  ): SearchQuery[] {
    const out: SearchQuery[] = [];
    for (const keyword of coverage.missingKeywords.slice(0, 4)) {
      out.push({
        query: `${input.company} ${input.position} ${keyword} 面试`,
        intent: `补关键词覆盖: ${keyword}`,
        priority: 88,
      });
      out.push({
        query: `${profile.roleType} ${keyword} 面试题`,
        intent: `补关键词覆盖: ${keyword}`,
        priority: 82,
      });
    }

    for (const t of coverage.missingQuestionTypes) {
      if (t === 'project') {
        out.push({
          query: `${input.company} ${input.position} 项目 追问`,
          intent: '补项目追问类型',
          priority: 86,
        });
      } else if (t === 'algorithm') {
        out.push({
          query: `${input.company} ${input.position} 算法题`,
          intent: '补算法题类型',
          priority: 84,
        });
      } else if (t === 'hr') {
        out.push({
          query: `${input.company} ${input.position} HR 面`,
          intent: '补 HR 问题类型',
          priority: 80,
        });
      } else if (t === 'technical') {
        out.push({
          query: `${profile.roleType} 技术面 深挖`,
          intent: '补技术深挖问题',
          priority: 83,
        });
      }
    }
    const unique = new Map<string, SearchQuery>();
    for (const q of out) {
      const key = q.query.toLowerCase();
      if (!unique.has(key)) unique.set(key, q);
    }
    return [...unique.values()].slice(0, 12);
  }
}
