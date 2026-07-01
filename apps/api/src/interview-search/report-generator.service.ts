import { Injectable } from '@nestjs/common';
import {
  InterviewReport,
  JdProfile,
  RankedQuestion,
  ReadPage,
  SearchResult,
} from './types/interview-search.types';

@Injectable()
export class ReportGeneratorService {
  generate(params: {
    profile: JdProfile;
    ranked: RankedQuestion[];
    sources: SearchResult[];
    pages: ReadPage[];
    extractedQuestions: {
      question: string;
      evidence: string;
      sourceUrl: string;
      topic: string;
      type: string;
    }[];
  }): InterviewReport {
    const { profile, ranked, sources, pages, extractedQuestions } = params;
    const topQuestions = ranked.slice(0, 20);
    const jdRelatedQuestions = ranked
      .filter((q) =>
        profile.technicalKeywords.some((k) =>
          q.question.toLowerCase().includes(k.toLowerCase()),
        ),
      )
      .slice(0, 10);
    const projectFollowupQuestions = ranked
      .filter((q) => q.type === 'project' || /项目|实现|优化/.test(q.question))
      .slice(0, 10);
    const sourceDomains = [...new Set(sources.map((s) => s.sourceDomain))];
    const summary = `共检索 ${sources.length} 条结果，成功读取 ${pages.filter((p) => p.readable).length} 个网页，沉淀 ${ranked.length} 条可追溯问题。`;
    const experienceDigests = this.buildExperienceDigests(extractedQuestions, sources);
    const practiceSet = ranked.slice(0, 12);

    return {
      summary,
      jdKeywords: profile.technicalKeywords,
      experienceDigests,
      practiceSet,
      topQuestions,
      jdRelatedQuestions,
      projectFollowupQuestions,
      reviewPlan: this.buildReviewPlan(topQuestions),
      sourceSummary: {
        totalSources: sources.length,
        readableSources: pages.filter((p) => p.readable).length,
        sourceDomains,
      },
    };
  }

  private buildExperienceDigests(
    questions: {
      question: string;
      evidence: string;
      sourceUrl: string;
      topic: string;
      type: string;
    }[],
    sources: SearchResult[],
  ): InterviewReport['experienceDigests'] {
    const domainMap = new Map<
      string,
      { questions: typeof questions; urls: Set<string> }
    >();
    const sourceDomainMap = new Map(sources.map((s) => [s.url, s.sourceDomain]));

    for (const q of questions) {
      const domain = sourceDomainMap.get(q.sourceUrl) ?? this.domainOf(q.sourceUrl);
      const prev = domainMap.get(domain) ?? { questions: [], urls: new Set<string>() };
      prev.questions.push(q);
      prev.urls.add(q.sourceUrl);
      domainMap.set(domain, prev);
    }

    const out: InterviewReport['experienceDigests'] = [];
    for (const [domain, payload] of domainMap) {
      const topTopics = [...new Set(payload.questions.map((x) => x.topic).filter(Boolean))]
        .slice(0, 3)
        .join(' / ');
      const sampleQs = payload.questions
        .slice(0, 2)
        .map((x) => x.question)
        .join('；');
      const summary = `${domain} 侧重 ${topTopics || '通用技术'}，常见问题示例：${sampleQs || '暂无'}`;
      out.push({
        platform: domain,
        summary,
        sourceUrls: [...payload.urls].slice(0, 4),
        evidences: payload.questions.map((x) => x.evidence).filter(Boolean).slice(0, 3),
      });
    }
    return out.sort((a, b) => b.sourceUrls.length - a.sourceUrls.length).slice(0, 8);
  }

  private domainOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  private buildReviewPlan(
    topQuestions: RankedQuestion[],
  ): InterviewReport['reviewPlan'] {
    return topQuestions.slice(0, 6).map((q, idx) => ({
      topic: q.topic || '通用',
      priority: idx < 2 ? 'high' : idx < 4 ? 'medium' : 'low',
      reason: q.reason,
      suggestedPreparation: [
        `整理 ${q.topic} 的一页笔记（定义、方案、取舍）`,
        '准备1个真实项目案例回答该题',
        '补充可量化指标与失败复盘',
      ],
    }));
  }
}
