import { Injectable } from '@nestjs/common';
import { InterviewSearchService } from '../../../interview-search/interview-search.service';
import type { InterviewSearchResultDto } from '../../../interview-search/dto/interview-search-result.dto';
import { interviewAgentConfig } from '../../config/interview-agent.config';
import type { LlmBudget } from '../../llm/llm-budget';
import { AgentTraceService } from '../../tracing/agent-trace.service';
import type {
  EvidenceSource,
  InterviewAgentSessionDoc,
  ResearchFindings,
  SourceTier,
} from '../../types/interview-agent.types';
import { DeepSearchPlannerService } from './deep-search-planner.service';
import type { DeepSearchPlanStep } from './deep-search-planner.service';
import { StyleAnalystService } from './style-analyst.service';

interface RoundOutcome {
  round: number;
  tier: SourceTier;
  queries: string[];
  hitCount: number;
  decision: string;
}

/**
 * 受控 ReAct 研究循环：
 * Thought(覆盖度评估) → Action(按 Tier 搜索) → Observation(命中) → Decision(充分退出 / 降级续搜 / 预算耗尽标记 degraded)
 * 循环由代码控制：轮数 ≤ maxSearchRounds，页面 ≤ maxPages。
 */
@Injectable()
export class ExperienceResearcherService {
  constructor(
    private readonly search: InterviewSearchService,
    private readonly planner: DeepSearchPlannerService,
    private readonly styleAnalyst: StyleAnalystService,
    private readonly trace: AgentTraceService,
  ) {}

  async research(
    session: InterviewAgentSessionDoc,
    budget?: LlmBudget,
  ): Promise<ResearchFindings> {
    const plan = this.planner.createPlan(session);
    this.trace.push(session, {
      step: 'research_plan_created',
      summary: `生成 ${plan.length} 级降级搜索计划，最多执行 ${interviewAgentConfig.maxSearchRounds} 轮`,
      from: 'DeepSearchPlanner',
      to: 'ExperienceResearcher',
      inputSummary: plan.map((step) => ({
        tier: step.tier,
        depth: step.searchDepth,
        reason: step.reason,
      })),
    });

    const sources: EvidenceSource[] = [];
    const questions: ResearchFindings['extractedQuestions'] = [];
    const searchRounds: RoundOutcome[] = [];
    const seenUrls = new Set<string>();
    const seenQuestions = new Set<string>();
    const executableSteps = plan.filter((step) => step.tier !== 'AGENT_SYNTHESIZED');
    const maxRounds = Math.max(
      1,
      Math.min(interviewAgentConfig.maxSearchRounds, executableSteps.length),
    );

    for (let round = 0; round < maxRounds; round += 1) {
      const step = executableSteps[round];
      const input = this.inputForTier(session, step);
      let result: InterviewSearchResultDto | null = null;
      try {
        result = await this.search.run(input);
      } catch (error) {
        this.trace.push(session, {
          step: 'research_round_failed',
          summary: `第 ${round + 1} 轮（${step.tier}）搜索失败，降级到下一层`,
          from: 'ExperienceResearcher',
          tool: 'interview-search.run',
          error: error instanceof Error ? error.message : 'unknown error',
        });
      }

      const queries = result?.queries.map((q) => q.query) ?? [];
      let newSources = 0;
      if (result) {
        this.addUsage(session, result);
        newSources = this.mergeRound(
          session,
          step.tier,
          result,
          sources,
          questions,
          seenUrls,
          seenQuestions,
        );
      }

      const sufficient = this.coverageSufficient(sources, questions);
      const pagesExhausted = sources.length >= interviewAgentConfig.maxPages;
      const lastRound = round === maxRounds - 1;
      const decision = sufficient
        ? '覆盖度充分，退出搜索循环'
        : pagesExhausted
          ? '页面预算耗尽，退出并标记 degraded'
          : lastRound
            ? '轮次预算耗尽，退出'
            : `覆盖不足（${sources.length} 源 / ${questions.length} 题），降级到 ${executableSteps[round + 1].tier}`;

      searchRounds.push({
        round: round + 1,
        tier: step.tier,
        queries,
        hitCount: newSources,
        decision,
      });
      this.trace.push(session, {
        step: 'research_round_done',
        summary: `第 ${round + 1} 轮（${step.tier}）新增 ${newSources} 源；${decision}`,
        from: 'ExperienceResearcher',
        tool: 'interview-search.run',
        inputSummary: { queries: queries.slice(0, 6) },
      });

      if (sufficient || pagesExhausted) break;
    }

    const degraded = !this.coverageSufficient(sources, questions);
    const finalSources = degraded ? this.withSynthesizedSource(sources) : sources;

    const styleProfile = await this.styleAnalyst.analyze(
      session,
      { sources: finalSources, questions, degraded },
      budget,
    );

    const findings: ResearchFindings = {
      sources: finalSources,
      extractedQuestions: questions,
      styleProfile,
      searchRounds,
      degraded,
    };
    this.trace.push(session, {
      step: 'research_completed',
      summary: `研究完成：${searchRounds.length} 轮搜索、${findings.sources.length} 个来源、${findings.extractedQuestions.length} 个候选问题，degraded=${degraded}，移交规划师`,
      from: 'ExperienceResearcher',
      to: 'InterviewPlanner',
      inputSummary: {
        sourceDomains: [...new Set(findings.sources.map((s) => s.domain))],
        tiers: [...new Set(findings.sources.map((s) => s.tier))],
      },
    });
    return findings;
  }

  /** 按降级层级变换搜索输入：越往下条件越宽 */
  private inputForTier(
    session: InterviewAgentSessionDoc,
    step: DeepSearchPlanStep,
  ): Parameters<InterviewSearchService['run']>[0] {
    const { company, position, jobDescription } = session.input;
    switch (step.tier) {
      case 'TARGET_COMPANY_TARGET_ROLE':
        return {
          company,
          position,
          jd: jobDescription,
          searchDepth: step.searchDepth,
        };
      case 'TARGET_COMPANY_SIMILAR_ROLE':
        return {
          company,
          position: this.broadenRole(position),
          jd: jobDescription,
          searchDepth: step.searchDepth,
        };
      case 'SIMILAR_COMPANY_TARGET_ROLE':
        return {
          company: '',
          position,
          jd: jobDescription,
          searchDepth: step.searchDepth,
        };
      case 'GENERIC_ROLE':
      default:
        return {
          company: '',
          position: this.broadenRole(position),
          jd: '',
          searchDepth: step.searchDepth,
        };
    }
  }

  /** 去掉级别修饰词，把岗位放宽到同方向相似岗位 */
  private broadenRole(position: string): string {
    const broadened = position
      .replace(/高级|资深|初级|中级|专家|首席|senior|junior|staff|principal|lead/gi, '')
      .trim();
    return broadened || position;
  }

  private coverageSufficient(
    sources: EvidenceSource[],
    questions: ResearchFindings['extractedQuestions'],
  ): boolean {
    return (
      sources.length >= interviewAgentConfig.minSources &&
      questions.length >= interviewAgentConfig.minQuestions
    );
  }

  /** 合并一轮搜索结果，按 URL/题干去重，返回新增来源数 */
  private mergeRound(
    session: InterviewAgentSessionDoc,
    tier: SourceTier,
    result: InterviewSearchResultDto,
    sources: EvidenceSource[],
    questions: ResearchFindings['extractedQuestions'],
    seenUrls: Set<string>,
    seenQuestions: Set<string>,
  ): number {
    let added = 0;
    const sourceIdByUrl = new Map<string, string>();
    const pageBudgetLeft = interviewAgentConfig.maxPages - sources.length;
    for (const source of result.sources.slice(0, Math.max(0, pageBudgetLeft))) {
      if (seenUrls.has(source.url)) {
        const existing = sources.find((s) => s.url === source.url);
        if (existing) sourceIdByUrl.set(source.url, existing.id);
        continue;
      }
      seenUrls.add(source.url);
      const evidence: EvidenceSource = {
        id: `source_${sources.length + 1}`,
        url: source.url,
        title: source.title,
        domain: source.sourceDomain,
        tier,
        credibility: this.credibility(source.sourceDomain, tier),
      };
      sources.push(evidence);
      sourceIdByUrl.set(source.url, evidence.id);
      added += 1;
    }

    for (const question of result.questions) {
      const normalized = question.question.replace(/\s+/g, '').toLowerCase();
      if (seenQuestions.has(normalized)) continue;
      const sourceId = sourceIdByUrl.get(question.sourceUrl);
      if (!sourceId) continue; // 页面预算外的来源，其题目一并丢弃
      seenQuestions.add(normalized);
      questions.push({
        question: question.question,
        type: question.type,
        topic: question.topic,
        sourceId,
      });
    }
    return added;
  }

  private credibility(domain: string, tier: SourceTier): number {
    const platformBonus = /nowcoder|zhihu|github|csdn|xiaohongshu/i.test(domain)
      ? 0.12
      : 0;
    const tierBase: Record<SourceTier, number> = {
      TARGET_COMPANY_TARGET_ROLE: 0.82,
      TARGET_COMPANY_SIMILAR_ROLE: 0.72,
      SIMILAR_COMPANY_TARGET_ROLE: 0.66,
      GENERIC_ROLE: 0.55,
      AGENT_SYNTHESIZED: 0.35,
    };
    return Math.min(0.95, Number((tierBase[tier] + platformBonus).toFixed(2)));
  }

  private withSynthesizedSource(sources: EvidenceSource[]): EvidenceSource[] {
    return [
      ...sources,
      {
        id: 'source_synthesized',
        url: 'agent://synthesized/interview-plan',
        title: 'Agent synthesized fallback',
        domain: 'agent',
        tier: 'AGENT_SYNTHESIZED',
        credibility: 0.35,
      },
    ];
  }

  private addUsage(
    session: InterviewAgentSessionDoc,
    result: InterviewSearchResultDto,
  ) {
    session.usage.searchCalls += result.queries.length;
    session.usage.pageReads += result.sources.length;
  }
}
