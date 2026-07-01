import { Injectable } from '@nestjs/common';
import {
  CoverageResult,
  ExtractedQuestion,
  InterviewSearchInput,
  JdProfile,
  ReadPage,
  SearchQuery,
  SearchResult,
} from './types/interview-search.types';

@Injectable()
export class CoverageReviewerService {
  review(params: {
    round: number;
    input: InterviewSearchInput;
    profile: JdProfile;
    questions: ExtractedQuestion[];
    pages: ReadPage[];
    sources: SearchResult[];
    nextQueries: SearchQuery[];
  }): CoverageResult {
    const { round, input, profile, questions, pages, sources, nextQueries } = params;
    const questionCount = questions.length;
    const readableSources = pages.filter((p) => p.readable);
    const companySources = new Set(
      sources
        .filter(
          (x) =>
            x.title.toLowerCase().includes(input.company.toLowerCase()) ||
            x.snippet.toLowerCase().includes(input.company.toLowerCase()) ||
            x.query.toLowerCase().includes(input.company.toLowerCase()),
        )
        .map((x) => x.url),
    );
    const coveredKeywords = profile.technicalKeywords.filter((k) =>
      questions.some(
        (q) =>
          q.question.toLowerCase().includes(k.toLowerCase()) ||
          q.evidence.toLowerCase().includes(k.toLowerCase()),
      ),
    );
    const keywordCoverageRatio =
      profile.technicalKeywords.length === 0
        ? 1
        : coveredKeywords.length / profile.technicalKeywords.length;
    const missingKeywords = profile.technicalKeywords.filter(
      (k) => !coveredKeywords.includes(k),
    );

    const typesNeed = ['technical', 'project', 'algorithm', 'hr'];
    const coveredTypeSet = new Set(questions.map((q) => q.type));
    const missingQuestionTypes = typesNeed.filter((t) => !coveredTypeSet.has(t as ExtractedQuestion['type']));

    const enoughSignals = [
      questionCount >= 20,
      keywordCoverageRatio >= 0.7,
      companySources.size >= 2,
      readableSources.length >= 5,
      missingQuestionTypes.length <= 1,
    ].filter(Boolean).length;

    const enough = enoughSignals >= 3;
    const reason = enough
      ? '覆盖度达到阈值，停止补搜。'
      : `覆盖不足：问题数=${questionCount}，关键词覆盖=${keywordCoverageRatio.toFixed(
          2,
        )}，公司相关来源=${companySources.size}。`;

    return {
      enough,
      round,
      questionCount,
      companySpecificSourceCount: companySources.size,
      keywordCoverageRatio: Number(keywordCoverageRatio.toFixed(3)),
      coveredKeywords,
      missingKeywords,
      missingQuestionTypes,
      reason,
      nextQueries: enough ? [] : nextQueries,
    };
  }
}
