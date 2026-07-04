import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ResumesService } from '../resumes/resumes.service';
import type { Resume } from '../resumes/resume.types';
import { AnswerDto } from './dto/answer.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { interviewAgentConfig } from './config/interview-agent.config';
import { LlmBudget } from './llm/llm-budget';
import { LlmClientService } from './llm/llm-client.service';
import { LlmContentError } from './llm/structured-output';
import { LongTermMemoryService } from './memory/long-term-memory.service';
import { SessionMemoryService } from './memory/session-memory.service';
import { AnswerJudgeService } from './modules/answer-judge.service';
import { ClaimExtractorService } from './modules/claim-extractor.service';
import { InterviewerService } from './modules/interviewer.service';
import { JdAnalyzerService } from './modules/jd-analyzer.service';
import { NextActionPolicyService } from './modules/next-action-policy.service';
import { ResumeAnalyzerService } from './modules/resume-analyzer.service';
import { ExperienceResearcherService } from './modules/research/experience-researcher.service';
import { InterviewPlannerService } from './modules/interview-planner.service';
import { PlanReviewerService } from './modules/plan-reviewer.service';
import { ReportGeneratorService } from './modules/report-generator.service';
import { SessionStoreService } from './store/session-store.service';
import { AgentTraceService } from './tracing/agent-trace.service';
import type {
  AnswerResponse,
  InterviewAgentSessionDoc,
  InterviewReport,
  InterviewTurn,
  InterviewMode,
  InterviewRound,
  LongTermMemoryEntry,
  MainQuestion,
  SanitizedResume,
  SessionInput,
} from './types/interview-agent.types';

const interviewRounds: InterviewRound[] = [
  'tech_first',
  'tech_second',
  'tech_third',
  'manager',
  'hr',
];

const interviewModes: InterviewMode[] = ['gentle', 'realistic', 'pressure'];

@Injectable()
export class InterviewAgentService {
  /** 会话级互斥：prepare/answer 等有 await 的路径按会话串行，防止 TOCTOU 双跑 */
  private readonly sessionLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly resumes: ResumesService,
    private readonly store: SessionStoreService,
    private readonly trace: AgentTraceService,
    private readonly llm: LlmClientService,
    private readonly jdAnalyzer: JdAnalyzerService,
    private readonly resumeAnalyzer: ResumeAnalyzerService,
    private readonly researcher: ExperienceResearcherService,
    private readonly planner: InterviewPlannerService,
    private readonly reviewer: PlanReviewerService,
    private readonly claimExtractor: ClaimExtractorService,
    private readonly judge: AnswerJudgeService,
    private readonly policy: NextActionPolicyService,
    private readonly interviewer: InterviewerService,
    private readonly sessionMemory: SessionMemoryService,
    private readonly reportGenerator: ReportGeneratorService,
    private readonly longTermMemory: LongTermMemoryService,
  ) {}

  createSession(dto: CreateSessionDto): SessionResponseDto {
    // 深度面试的所有内容都由 LLM 生成，没有可用 provider 时诚实拒绝，不降级为模板面试
    if (!this.llm.hasProvider()) {
      throw new ServiceUnavailableException(
        '深度面试需要 LLM 服务：请配置 INTERVIEW_API_KEY / INTERVIEW_BASE_URL / INTERVIEW_MODEL（或 DASHSCOPE_API_KEY / OPENAI_*）后重试',
      );
    }
    const input = this.normalizeInput(dto);
    const resumeFile = this.resumes.getFile(input.resumeFileId);
    const snapshot = this.sanitizeResume(resumeFile.data);
    const session = this.store.create(input, snapshot);
    this.trace.push(session, {
      step: 'session_created',
      summary: '深度面试会话已创建，并保存脱敏简历快照',
      inputSummary: {
        resumeFileId: input.resumeFileId,
        company: input.company,
        position: input.position,
        round: input.interviewRound,
        mode: input.mode,
        maxQuestions: input.maxQuestions,
      },
    });
    this.store.save(session);
    return this.toResponse(session);
  }

  getSession(sessionId: string): SessionResponseDto {
    return this.toResponse(this.store.get(sessionId));
  }

  async getReport(sessionId: string): Promise<InterviewReport> {
    return this.runExclusive(sessionId, async () => {
      const session = this.store.get(sessionId);
      if (session.status !== 'COMPLETED') {
        throw new BadRequestException('Report is available after the interview is completed');
      }
      if (!session.report) {
        session.report = await this.reportGenerator.generate(
          session,
          new LlmBudget(session, 'turn'),
        );
        this.store.save(session);
      }
      return session.report;
    });
  }

  listLongTermMemory(resumeFileId?: string): LongTermMemoryEntry[] {
    return this.longTermMemory.list(resumeFileId);
  }

  deleteLongTermMemory(entryId: string): { deletedId: string } {
    return this.longTermMemory.delete(entryId);
  }

  async prepare(sessionId: string): Promise<SessionResponseDto> {
    return this.runExclusive(sessionId, () => this.prepareInner(sessionId));
  }

  private async prepareInner(sessionId: string): Promise<SessionResponseDto> {
    const session = this.store.get(sessionId);
    if (session.status === 'READY') return this.toResponse(session);
    if (session.status !== 'CREATED' && session.status !== 'PREPARE_FAILED') {
      throw new BadRequestException(
        `Cannot prepare session in status ${session.status}`,
      );
    }

    session.status = 'PREPARING';
    this.trace.push(session, {
      step: 'prepare_started',
      summary: '开始准备期：JD分析、简历分析、面经研究、面试计划生成',
    });
    this.store.save(session);
    const budget = new LlmBudget(session, 'prepare');

    try {
      session.jdMatrix = await this.jdAnalyzer.analyze(session, budget);
      this.store.save(session);

      session.resumeAnalysis = await this.resumeAnalyzer.analyze(session, budget);
      this.sessionMemory.seedResumeClaims(session);
      this.store.save(session);

      session.research = await this.researcher.research(session, budget);
      this.store.save(session);

      session.plan = await this.planner.createReviewedPlan(
        session,
        budget,
        this.reviewer,
      );
      session.status = 'READY';
      this.trace.push(session, {
        step: 'prepare_completed',
        summary: '准备期完成，会话进入 READY 状态',
        inputSummary: {
          sourceCount: session.research.sources.length,
          questionPoolSize: session.plan.mainQuestionPool.length,
          degraded: session.research.degraded,
          llmCalls: session.usage.llmCalls,
        },
      });
      this.store.save(session);
      return this.toResponse(session);
    } catch (error) {
      session.status = 'PREPARE_FAILED';
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.trace.push(session, {
        step: 'prepare_failed',
        summary: `准备期失败：${reason}。可重试 prepare`,
        error: reason,
      });
      this.store.save(session);
      return this.toResponse(session);
    }
  }

  async start(sessionId: string): Promise<AnswerResponse> {
    return this.runExclusive(sessionId, async () => {
      const session = this.store.get(sessionId);
      if (session.status === 'INTERVIEWING' && session.turns.length > 0) {
        const latest = session.turns[session.turns.length - 1];
        return {
          action: 'ASK_MAIN' as const,
          acknowledgement: '本轮深度模拟面试已经开始，继续回答当前问题即可。',
          nextQuestion: latest.answerText ? null : latest.question,
          progress: this.answerProgress(session),
          sessionStatus: session.status,
        };
      }
      if (session.status !== 'READY') {
        throw new BadRequestException(
          `Cannot start session in status ${session.status}`,
        );
      }
      const first = this.interviewer.chooseNextMainQuestion(session);
      if (!first) {
        throw new BadRequestException('Interview plan has no questions');
      }
      session.status = 'INTERVIEWING';
      this.appendQuestionTurn(session, first.question, first, 'plan_pool', 0);
      const acknowledgement = await this.interviewer.opening(
        session,
        first.question,
        new LlmBudget(session, 'turn'),
      );
      this.trace.push(session, {
        step: 'interview_started',
        summary: '深度面试已开始，并发出第一道主问题',
        inputSummary: {
          mainQuestionId: first.id,
          competencyIds: first.competencyIds,
        },
      });
      this.store.save(session);
      return {
        action: 'ASK_MAIN' as const,
        acknowledgement,
        nextQuestion: first.question,
        progress: this.answerProgress(session),
        sessionStatus: session.status,
      };
    });
  }

  async answer(sessionId: string, dto: AnswerDto): Promise<AnswerResponse> {
    return this.runExclusive(sessionId, () => this.answerInner(sessionId, dto));
  }

  /**
   * Turn 管道（每轮 3-4 次 LLM 调用，受 turn 预算约束）：
   * 回答 → ①Claim 抽取 → ②多维评审 → ③Memory 更新 → ④两层策略决策 → ⑤面试官生成衔接+下一问
   */
  private async answerInner(
    sessionId: string,
    dto: AnswerDto,
  ): Promise<AnswerResponse> {
    const session = this.store.get(sessionId);
    if (session.status !== 'INTERVIEWING') {
      throw new BadRequestException(
        `Cannot answer session in status ${session.status}`,
      );
    }
    const answerText = String(dto.answer ?? '').trim();
    if (!answerText) throw new BadRequestException('answer is required');
    const current = this.currentUnansweredTurn(session);
    if (!current) {
      throw new BadRequestException('No active question to answer');
    }

    current.answerText = answerText;
    current.answeredAt = new Date().toISOString();

    // 会话级 LLM 预算不足以完成一整轮管道时，优雅收尾而不是中途失败
    const remainingSessionBudget =
      interviewAgentConfig.sessionLlmCallLimit - session.usage.llmCalls;
    if (remainingSessionBudget < 4) {
      current.decision = {
        action: 'END_INTERVIEW',
        reason: `会话 LLM 预算即将耗尽（剩余 ${remainingSessionBudget} 次）`,
        ruleTriggered: 'SESSION_LLM_BUDGET_EXHAUSTED',
      };
      await this.completeSession(session);
      this.store.save(session);
      return {
        action: 'END_INTERVIEW',
        acknowledgement:
          '本场模拟面试的 AI 预算已用完，我先结束这轮并整理已有回答的复盘报告。',
        nextQuestion: null,
        progress: this.answerProgress(session),
        sessionStatus: session.status,
      };
    }

    const budget = new LlmBudget(session, 'turn');

    const extractedClaims = await this.claimExtractor.extractAndMerge(
      session,
      current,
      answerText,
      budget,
    );
    current.judge = await this.judge.judge(
      session,
      current,
      answerText,
      extractedClaims,
      budget,
    );
    this.sessionMemory.updateClaimsAfterJudge(session, current, current.judge);
    this.updateMemoryAfterJudge(session, current);
    current.decision = await this.policy.decide(session, current, current.judge, budget);

    let nextMain: MainQuestion | undefined;
    if (current.decision.action === 'SWITCH_TOPIC') {
      nextMain = this.interviewer.chooseNextMainQuestion(session);
      if (!nextMain) {
        current.decision = {
          action: 'END_INTERVIEW',
          reason: '没有剩余主问题候选',
          ruleTriggered: 'NO_MAIN_QUESTION_LEFT',
        };
      }
    }

    const composed = await this.interviewer.composeTurn({
      session,
      answeredTurn: current,
      answerText,
      decision: current.decision,
      nextMainQuestion: nextMain,
      budget,
    });
    let nextQuestion = composed.nextQuestion;

    if (current.decision.action === 'END_INTERVIEW') {
      await this.completeSession(session);
      nextQuestion = null;
    } else if (nextQuestion) {
      const main = nextMain ?? this.mainQuestionForTurn(session, current);
      if (!main) {
        current.decision = {
          action: 'END_INTERVIEW',
          reason: '当前问题缺少主问题锚点，结束面试',
          ruleTriggered: 'MISSING_MAIN_QUESTION',
        };
        await this.completeSession(session);
        nextQuestion = null;
      } else {
        this.appendQuestionTurn(
          session,
          nextQuestion,
          main,
          current.decision.action === 'SWITCH_TOPIC' ? 'plan_pool' : 'dynamic',
          current.decision.action === 'SWITCH_TOPIC' ? 0 : current.followUpDepth + 1,
        );
      }
    }

    this.trace.push(session, {
      step: 'answer_processed',
      summary: `处理第 ${current.index} 轮回答，决策=${current.decision.action}`,
      inputSummary: {
        turnId: current.turnId,
        extractedClaimIds: current.extractedClaimIds,
        informationGain: current.judge.informationGain,
        targetClaimId: current.decision.targetClaimId,
        ruleTriggered: current.decision.ruleTriggered,
        turnLlmCalls: session.usage.llmCalls,
      },
    });
    this.store.save(session);
    return {
      action: current.decision.action,
      acknowledgement: composed.acknowledgement,
      nextQuestion,
      progress: this.answerProgress(session),
      sessionStatus: session.status,
    };
  }

  async end(sessionId: string): Promise<AnswerResponse> {
    return this.runExclusive(sessionId, async () => {
      const session = this.store.get(sessionId);
      if (!['READY', 'INTERVIEWING', 'COMPLETED'].includes(session.status)) {
        throw new BadRequestException(
          `Cannot end session in status ${session.status}`,
        );
      }
      if (session.status !== 'COMPLETED') {
        await this.completeSession(session);
      }
      this.trace.push(session, {
        step: 'interview_ended',
        summary: '用户主动结束深度模拟面试，已生成复盘报告',
        inputSummary: {
          turnCount: session.turns.length,
          answeredCount: session.turns.filter((turn) => turn.answerText).length,
        },
      });
      this.store.save(session);
      return {
        action: 'END_INTERVIEW' as const,
        acknowledgement: '本轮深度模拟面试已结束。',
        nextQuestion: null,
        progress: this.answerProgress(session),
        sessionStatus: session.status,
      };
    });
  }

  /**
   * 收尾：状态置 COMPLETED；报告/长期记忆生成失败不阻塞结束
   * （report 留空，之后通过 GET /report 重试；失败原因写入 trace）。
   */
  private async completeSession(session: InterviewAgentSessionDoc): Promise<void> {
    session.status = 'COMPLETED';
    try {
      session.report = await this.reportGenerator.generate(
        session,
        new LlmBudget(session, 'turn'),
      );
    } catch (error) {
      this.trace.push(session, {
        step: 'report_generation_failed',
        summary: '复盘报告生成失败，可稍后通过 report 接口重试',
        error: error instanceof Error ? error.message : 'unknown error',
      });
      return;
    }
    try {
      await this.longTermMemory.extractFromSession(
        session,
        session.report,
        new LlmBudget(session, 'turn'),
      );
    } catch (error) {
      this.trace.push(session, {
        step: 'long_term_memory_failed',
        summary: '长期记忆提炼失败，本场跳过（不影响报告）',
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  /**
   * 会话级互斥 + LLM 错误语义化：内容生成失败对外是 503（本轮可重试），
   * 失败的请求不落盘，会话状态自动回滚到上一次成功保存。
   */
  private runExclusive<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const wrapped = async () => {
      try {
        return await fn();
      } catch (error) {
        if (error instanceof LlmContentError) {
          throw new ServiceUnavailableException(
            `AI 面试官暂时不可用（${error.message}），本轮未消耗，请稍后重试`,
          );
        }
        throw error;
      }
    };
    const previous = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    const next = previous.then(wrapped, wrapped);
    this.sessionLocks.set(
      sessionId,
      next.catch(() => undefined),
    );
    return next;
  }

  private normalizeInput(dto: CreateSessionDto): SessionInput {
    const resumeFileId = String(dto.resumeFileId ?? '').trim();
    if (!resumeFileId) throw new BadRequestException('resumeFileId is required');
    const company = String(dto.company ?? '').trim();
    const position = String(dto.position ?? '').trim();
    if (!position) throw new BadRequestException('position is required');
    const interviewRound = interviewRounds.includes(dto.interviewRound)
      ? dto.interviewRound
      : 'tech_first';
    const mode = interviewModes.includes(dto.mode) ? dto.mode : 'realistic';
    const maxQuestions = Math.min(
      20,
      Math.max(3, Number(dto.maxQuestions || 8)),
    );
    return {
      resumeFileId,
      company,
      position,
      jobDescription: String(dto.jobDescription ?? '').trim(),
      interviewRound,
      mode,
      maxQuestions,
    };
  }

  private sanitizeResume(resume: Resume): SanitizedResume {
    return {
      ...resume,
      basics: {
        summary: resume.basics.summary,
        extraInfos: resume.basics.extraInfos?.filter((item) =>
          /方向|主页|作品|github|blog|portfolio/i.test(
            `${item.label} ${item.icon ?? ''}`,
          ),
        ),
      },
    };
  }

  /**
   * 对外响应只暴露进度与脱敏 trace 摘要。
   * 题库/rubric/judge 信号/研究原文属于面试官内部状态，不出网。
   */
  private toResponse(session: InterviewAgentSessionDoc): SessionResponseDto {
    if (!session) {
      throw new NotFoundException('session not found');
    }
    return {
      sessionId: session.sessionId,
      status: session.status,
      input: session.input,
      progress: {
        traceCount: session.trace.length,
        questionPoolSize: session.plan?.mainQuestionPool.length ?? 0,
        sourceCount: session.research?.sources.length ?? 0,
        degraded: session.research?.degraded ?? false,
        turnCount: session.turns.length,
        answeredCount: session.turns.filter((turn) => turn.answerText).length,
      },
      usage: session.usage,
      traceTail: session.trace.slice(-8).map((event) => ({
        id: event.id,
        step: event.step,
        summary: event.summary,
        from: event.from,
        to: event.to,
        createdAt: event.createdAt,
      })),
    };
  }

  private appendQuestionTurn(
    session: InterviewAgentSessionDoc,
    question: string,
    mainQuestion: MainQuestion,
    questionSource: InterviewTurn['questionSource'],
    followUpDepth: number,
  ): InterviewTurn {
    const turn: InterviewTurn = {
      turnId: this.newId('turn'),
      index: session.turns.length + 1,
      question,
      questionSource,
      mainQuestionId: mainQuestion.id,
      followUpDepth,
      extractedClaimIds: [],
    };
    session.turns.push(turn);
    session.memory.session.questionCount += 1;
    session.memory.session.currentMainQuestionId = mainQuestion.id;
    session.memory.session.followUpDepth = followUpDepth;
    return turn;
  }

  private currentUnansweredTurn(
    session: InterviewAgentSessionDoc,
  ): InterviewTurn | undefined {
    return [...session.turns].reverse().find((turn) => !turn.answerText);
  }

  private mainQuestionForTurn(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
  ): MainQuestion | undefined {
    return session.plan?.mainQuestionPool.find(
      (question) => question.id === turn.mainQuestionId,
    );
  }

  private updateMemoryAfterJudge(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
  ) {
    if (!turn.judge) return;
    session.memory.session.lowInformationStreak =
      turn.judge.informationGain === 'low'
        ? session.memory.session.lowInformationStreak + 1
        : 0;
    const main = this.mainQuestionForTurn(session, turn);
    if (main && turn.judge.informationGain !== 'low') {
      const covered = new Set(session.memory.session.coveredCompetencyIds);
      for (const id of main.competencyIds) covered.add(id);
      session.memory.session.coveredCompetencyIds = [...covered];
    }

    for (const update of turn.judge.competencyUpdates) {
      const existing = session.memory.competencies.find(
        (item) => item.competencyId === update.competencyId,
      );
      if (existing) {
        existing.score = Math.max(1, Math.min(5, existing.score + update.scoreDelta));
        existing.confidence = Math.max(
          0,
          Math.min(1, existing.confidence + update.confidenceDelta),
        );
        if (!existing.evidenceTurnIds.includes(update.evidenceTurnId)) {
          existing.evidenceTurnIds.push(update.evidenceTurnId);
        }
      } else {
        session.memory.competencies.push({
          competencyId: update.competencyId,
          score: Math.max(1, Math.min(5, 3 + update.scoreDelta)),
          confidence: Math.max(0, Math.min(1, 0.35 + update.confidenceDelta)),
          evidenceTurnIds: [update.evidenceTurnId],
        });
      }
    }
  }

  private answerProgress(
    session: InterviewAgentSessionDoc,
  ): AnswerResponse['progress'] {
    return {
      questionCount: session.memory.session.questionCount,
      maxQuestions:
        session.plan?.stopConditions.maxQuestions ?? session.input.maxQuestions,
      coveredCompetencies: session.memory.session.coveredCompetencyIds.length,
      totalCompetencies: session.jdMatrix?.competencies.length ?? 0,
    };
  }

  private newId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
