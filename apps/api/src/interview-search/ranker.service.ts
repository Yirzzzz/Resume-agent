import { Injectable } from '@nestjs/common';
import {
  InterviewSearchInput,
  JdProfile,
  QuestionCluster,
  RankedQuestion,
} from './types/interview-search.types';

@Injectable()
export class RankerService {
  rank(
    clusters: QuestionCluster[],
    profile: JdProfile,
    input: InterviewSearchInput,
  ): RankedQuestion[] {
    const rows = clusters.map((cluster) => {
      const representative = cluster.representativeQuestion;
      const lcQ = representative.toLowerCase();
      const jdHits = profile.technicalKeywords.filter((k) =>
        lcQ.includes(k.toLowerCase()),
      );
      const roleHits = profile.roleAliases.filter((k) =>
        lcQ.includes(k.toLowerCase()),
      );
      const companyHit =
        cluster.sourceUrls.some((u) => u.toLowerCase().includes(input.company.toLowerCase())) ||
        lcQ.includes(input.company.toLowerCase());
      const confidence =
        cluster.questions.reduce((acc, x) => acc + x.confidence, 0) /
        Math.max(1, cluster.questions.length);
      const freqScore = Math.min(cluster.frequency / 5, 1);
      const projectValue =
        cluster.questions.some((q) => q.type === 'project') ||
        /(项目|实现|为什么|怎么做|难点|优化)/.test(representative)
          ? 1
          : 0;
      const jdRelevance = Math.min(jdHits.length / 3, 1);
      const roleRelevance = Math.min(roleHits.length / 2, 1);
      const companyRelevance = companyHit ? 1 : 0;

      const score =
        0.35 * jdRelevance +
        0.2 * roleRelevance +
        0.15 * companyRelevance +
        0.15 * confidence +
        0.1 * freqScore +
        0.05 * projectValue;

      return {
        question: representative,
        type: cluster.questions[0]?.type ?? 'unknown',
        topic: cluster.topic,
        score: Number(score.toFixed(4)),
        reason: `jd命中${jdHits.length}，role命中${roleHits.length}，频次${cluster.frequency}`,
        frequency: cluster.frequency,
        sourceUrls: cluster.sourceUrls,
        evidences: cluster.questions.map((x) => x.evidence).filter(Boolean).slice(0, 3),
        expectedPoints: this.expectedPoints(cluster.topic, cluster.questions[0]?.type ?? 'unknown'),
      } satisfies RankedQuestion;
    });

    return rows.sort((a, b) => b.score - a.score);
  }

  private expectedPoints(topic: string, type: string): string[] {
    if (type === 'project') {
      return ['业务背景与目标', '方案选型与取舍', '核心实现细节', '结果指标与复盘'];
    }
    if (type === 'algorithm') {
      return ['算法思路', '复杂度分析', '边界条件', '优化方向'];
    }
    if (type === 'technical') {
      return ['系统原理', '工程落地', '性能指标', '异常与监控'];
    }
    return [`围绕 ${topic} 的结构化回答`, '结合实际项目举例'];
  }
}
