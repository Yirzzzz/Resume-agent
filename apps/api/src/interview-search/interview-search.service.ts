import { Injectable } from '@nestjs/common';
import { CreateInterviewSearchDto } from './dto/create-interview-search.dto';
import { InterviewSearchResultDto } from './dto/interview-search-result.dto';
import { CoverageReviewerService } from './coverage-reviewer.service';
import { DeepInterviewComposerService } from './deep-interview-composer.service';
import { DedupClusterService } from './dedup-cluster.service';
import { JdParserService } from './jd-parser.service';
import { PageReaderService } from './page-reader.service';
import { QueryRefinerService } from './query-refiner.service';
import { QuestionExtractorService } from './question-extractor.service';
import { RankerService } from './ranker.service';
import { ReportGeneratorService } from './report-generator.service';
import { SearchPlannerService } from './search-planner.service';
import { WebSearchService } from './web-search.service';
import {
  CoverageResult,
  InterviewSearchInput,
  InterviewSearchState,
  SearchQuery,
} from './types/interview-search.types';

@Injectable()
export class InterviewSearchService {
  constructor(
    private readonly jdParser: JdParserService,
    private readonly planner: SearchPlannerService,
    private readonly webSearch: WebSearchService,
    private readonly pageReader: PageReaderService,
    private readonly extractor: QuestionExtractorService,
    private readonly reviewer: CoverageReviewerService,
    private readonly deepComposer: DeepInterviewComposerService,
    private readonly refiner: QueryRefinerService,
    private readonly dedupCluster: DedupClusterService,
    private readonly ranker: RankerService,
    private readonly reportGenerator: ReportGeneratorService,
  ) {}

  async run(dto: CreateInterviewSearchDto): Promise<InterviewSearchResultDto> {
    const input = this.normalizeInput(dto);
    const taskId = this.newTaskId();
    const state = this.initState(taskId, input);
    this.trace(state, 'normalize_input', '输入参数标准化完成', { input });
    this.trace(state, 'providers', '当前 DeepSearch provider 状态', {
      searchProvider: this.webSearch.getProviderName(),
      extractorProvider: this.extractor.getProviderName(),
      jinaReaderEnabled:
        String(process.env.JINA_READER_ENABLED ?? '').toLowerCase() === 'true',
    });

    state.jdProfile = await this.jdParser.parse(input);
    this.trace(state, 'parse_jd', 'JD 解析完成', { jdProfile: state.jdProfile });

    let maxRounds = 1;
    if (input.searchDepth === 'standard') maxRounds = 2;
    if (input.searchDepth === 'deep') maxRounds = 3;

    let pendingQueries: SearchQuery[] = this.planner.createInitialRound(input, state.jdProfile).queries;
    for (let round = 1; round <= maxRounds; round += 1) {
      const strategy = round === 1 ? 'company_exact' : 'refinement';
      const reason = round === 1 ? '首轮覆盖公司+岗位+技术专题' : '根据覆盖缺口补搜';
      state.searchRounds.push({
        round,
        strategy,
        queries: pendingQueries,
        reason,
      });
      this.trace(state, 'start_round', `开始第 ${round} 轮检索`, {
        round,
        queries: pendingQueries,
      });

      // 4.1 search
      const roundResults = await this.searchRound(pendingQueries);
      state.searchResults.push(...roundResults);
      this.trace(state, 'search_completed', `第 ${round} 轮搜索完成`, {
        resultCount: roundResults.length,
      });

      // 4.2 read pages
      const uniqueUrls = this.uniqueUrls(state.searchResults).slice(0, this.pageBudget(input.searchDepth));
      const pages = await Promise.all(
        uniqueUrls.map((url) => {
          const row = state.searchResults.find((x) => x.url === url);
          if (!row) return null;
          return this.pageReader.read(row);
        }),
      );
      const validPages = pages.filter((x): x is NonNullable<typeof x> => Boolean(x));
      this.mergePages(state, validPages);
      this.trace(state, 'page_read_completed', `第 ${round} 轮网页读取完成`, {
        readableCount: validPages.filter((x) => x.readable).length,
        total: validPages.length,
      });

      // 4.3 extract questions
      const readablePages = validPages.filter((x) => x.readable);
      const roundQuestions = (
        await Promise.all(
          readablePages.map((p) => this.extractor.extractFromPage(p, state.jdProfile)),
        )
      ).flat();
      const relevantRoundQuestions = this.filterRelevantQuestions(
        roundQuestions,
        state.input,
        state.jdProfile,
      );
      state.extractedQuestions.push(...relevantRoundQuestions);
      this.trace(state, 'question_extracted', `第 ${round} 轮问题抽取完成`, {
        extractedCount: roundQuestions.length,
        keptCount: relevantRoundQuestions.length,
      });

      // 4.5 dedup & cluster
      const clustered = this.dedupCluster.dedupAndCluster(state.extractedQuestions);
      state.extractedQuestions = clustered.deduped;
      state.clusters = clustered.clusters;

      // 4.6 coverage review
      const nextQueries = this.refiner.refine(input, state.jdProfile, {
        enough: false,
        round,
        questionCount: state.extractedQuestions.length,
        companySpecificSourceCount: 0,
        keywordCoverageRatio: 0,
        coveredKeywords: [],
        missingKeywords: state.jdProfile.technicalKeywords,
        missingQuestionTypes: ['technical', 'project', 'algorithm', 'hr'],
        reason: '预估覆盖缺口',
        nextQueries: [],
      } satisfies CoverageResult);
      const coverage = this.reviewer.review({
        round,
        input,
        profile: state.jdProfile,
        questions: state.extractedQuestions,
        pages: state.pages,
        sources: state.searchResults,
        nextQueries,
      });
      state.coverage = coverage;
      this.trace(state, 'coverage_reviewed', `第 ${round} 轮覆盖评估完成`, coverage);

      if (coverage.enough || round >= maxRounds) break;
      pendingQueries = coverage.nextQueries;
      this.trace(state, 'refine_queries', '触发补搜', {
        round,
        nextQueries: pendingQueries,
      });
    }

    // 5 rank
    state.rankedQuestions = this.ranker.rank(
      state.clusters,
      state.jdProfile,
      state.input,
    );
    // 6 report
    state.report = this.reportGenerator.generate({
      profile: state.jdProfile,
      ranked: state.rankedQuestions,
      sources: state.searchResults,
      pages: state.pages,
      extractedQuestions: state.extractedQuestions,
    });
    state.deepInterview = await this.deepComposer.compose({
      input: state.input,
      profile: state.jdProfile,
      ranked: state.rankedQuestions,
    });
    this.trace(state, 'report_generated', '最终报告生成完成', {
      rankedCount: state.rankedQuestions.length,
      deepInterviewCount: state.deepInterview.questions.length,
    });

    return {
      taskId: state.taskId,
      input: state.input,
      jdProfile: state.jdProfile,
      trace: state.trace,
      queries: state.searchRounds.flatMap((r) => r.queries),
      sources: state.searchResults,
      questions: state.extractedQuestions,
      clusters: state.clusters,
      rankedQuestions: state.rankedQuestions,
      deepInterview: state.deepInterview,
      report: state.report,
    };
  }

  private normalizeInput(dto: CreateInterviewSearchDto): InterviewSearchInput {
    const searchDepth =
      dto.searchDepth === 'deep' || dto.searchDepth === 'standard'
        ? dto.searchDepth
        : 'quick';
    return {
      company: String(dto.company ?? '').trim(),
      position: String(dto.position ?? '').trim(),
      jd: String(dto.jd ?? '').trim(),
      resume: String(dto.resume ?? '').trim() || undefined,
      searchDepth,
    };
  }

  private initState(taskId: string, input: InterviewSearchInput): InterviewSearchState {
    return {
      taskId,
      input,
      jdProfile: {
        roleType: '',
        responsibilities: [],
        requiredSkills: [],
        technicalKeywords: [],
        companyAliases: [],
        roleAliases: [],
      },
      searchRounds: [],
      searchResults: [],
      pages: [],
      extractedQuestions: [],
      clusters: [],
      coverage: {
        enough: false,
        round: 0,
        questionCount: 0,
        companySpecificSourceCount: 0,
        keywordCoverageRatio: 0,
        coveredKeywords: [],
        missingKeywords: [],
        missingQuestionTypes: [],
        reason: '',
        nextQueries: [],
      },
      rankedQuestions: [],
      report: {
        summary: '',
        jdKeywords: [],
        experienceDigests: [],
        practiceSet: [],
        topQuestions: [],
        jdRelatedQuestions: [],
        projectFollowupQuestions: [],
        reviewPlan: [],
        sourceSummary: {
          totalSources: 0,
          readableSources: 0,
          sourceDomains: [],
        },
      },
      deepInterview: {
        opening: '',
        strategy: '',
        questions: [],
      },
      trace: [],
    };
  }

  private trace(state: InterviewSearchState, step: string, message: string, data?: unknown) {
    state.trace.push({
      step,
      message,
      data,
      createdAt: new Date().toISOString(),
    });
  }

  private async searchRound(queries: SearchQuery[]) {
    const rows = await Promise.all(queries.map((q) => this.webSearch.search(q)));
    const flat = rows.flat();
    const seen = new Set<string>();
    return flat.filter((x) => {
      if (!x.url || seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    });
  }

  private uniqueUrls(rows: { url: string }[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      if (!row.url || seen.has(row.url)) continue;
      seen.add(row.url);
      out.push(row.url);
    }
    return out;
  }

  private mergePages(state: InterviewSearchState, pages: InterviewSearchState['pages']) {
    const seen = new Set(state.pages.map((p) => p.url));
    for (const page of pages) {
      if (seen.has(page.url)) continue;
      seen.add(page.url);
      state.pages.push(page);
    }
  }

  private pageBudget(depth: InterviewSearchInput['searchDepth']): number {
    if (depth === 'quick') return 10;
    if (depth === 'standard') return 20;
    return 30;
  }

  private newTaskId(): string {
    return `is_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private filterRelevantQuestions(
    rows: InterviewSearchState['extractedQuestions'],
    input: InterviewSearchInput,
    profile: InterviewSearchState['jdProfile'],
  ): InterviewSearchState['extractedQuestions'] {
    if (rows.length === 0) return rows;
    const keywords = [
      ...profile.technicalKeywords,
      ...profile.roleAliases,
      ...profile.companyAliases,
      input.company,
      input.position,
    ]
      .map((x) => String(x ?? '').trim().toLowerCase())
      .filter(Boolean);

    const scored = rows.map((q) => {
      const text = `${q.question} ${q.evidence}`.toLowerCase();
      const hit = keywords.filter((k) => text.includes(k)).length;
      const typeBoost =
        q.type === 'project' || q.type === 'technical' || q.type === 'algorithm'
          ? 1
          : 0;
      return { q, score: hit + typeBoost };
    });

    const strong = scored.filter((x) => x.score >= 1).map((x) => x.q);
    if (strong.length > 0) return strong;

    // 如果全部不命中，至少保留部分高置信问题，避免空结果。
    return scored
      .sort((a, b) => b.q.confidence - a.q.confidence)
      .slice(0, Math.min(8, scored.length))
      .map((x) => x.q);
  }
}
