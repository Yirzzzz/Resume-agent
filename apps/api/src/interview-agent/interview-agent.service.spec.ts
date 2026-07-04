import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InterviewAgentService } from './interview-agent.service';
import { StructuredOutputService } from './llm/structured-output';
import type { ChatMessage, LlmClientService } from './llm/llm-client.service';
import { LongTermMemoryService } from './memory/long-term-memory.service';
import { SessionMemoryService } from './memory/session-memory.service';
import { AnswerJudgeService } from './modules/answer-judge.service';
import { ClaimExtractorService } from './modules/claim-extractor.service';
import { InterviewerService } from './modules/interviewer.service';
import { NextActionPolicyService } from './modules/next-action-policy.service';
import { ReportGeneratorService } from './modules/report-generator.service';
import { SessionStoreService } from './store/session-store.service';
import { AgentTraceService } from './tracing/agent-trace.service';
import type {
  InterviewAgentSessionDoc,
  SanitizedResume,
} from './types/interview-agent.types';

/**
 * 按内部角色路由的 LLM mock：每个角色返回 schema 合法的 JSON。
 * 面试内容全部来自（mock 的）LLM —— 与生产行为一致，管道里没有规则内容。
 */
function routedLlm(
  overrides: {
    policy?: (prompt: string) => unknown;
    judge?: (prompt: string) => unknown;
    interviewer?: (prompt: string) => unknown;
  } = {},
): LlmClientService {
  const judgeBase = {
    scores: {
      technicalAccuracy: 3,
      depth: 3,
      implementationDetail: 3,
      evidenceSufficiency: 2,
      experimentRigor: 2,
      rationality: 3,
      jdRelevance: 4,
      logic: 3,
      ownershipClarity: 4,
    },
    informationGain: 'medium',
    evidenceGaps: [{ claimId: 'claim_1', missing: '缺少 baseline 与量化指标口径' }],
    contradictions: [],
    competencyUpdates: [
      { competencyId: 'comp_api', scoreDelta: 0.4, confidenceDelta: 0.2 },
    ],
    reasoning: '回答提到「负责订单服务的核心链路重构」但未给出可验证指标。',
  };
  const route = (system: string, prompt: string): unknown => {
    if (system.includes('断言')) {
      return {
        claims: [
          { content: '我负责订单服务的核心链路重构并主导优化', kind: 'ownership', importance: 5 },
        ],
      };
    }
    if (system.includes('评审官')) {
      if (overrides.judge) return overrides.judge(prompt);
      if (/不是我负责|没参与/.test(prompt)) {
        return {
          ...judgeBase,
          informationGain: 'low',
          evidenceGaps: [],
          contradictions: [
            {
              claimId: 'claim_1',
              conflictsWith: '负责订单链路 API 设计并主导性能优化',
              description: '本轮回答否认了此前声称的职责归属',
            },
          ],
        };
      }
      return judgeBase;
    }
    if (system.includes('策略决策器')) {
      if (overrides.policy) return overrides.policy(prompt);
      // 本轮评审发现矛盾时优先澄清（prompt 的 currentTurn.contradictions 非空）
      if (prompt.includes('"conflictsWith"')) {
        return {
          action: 'CLARIFY_CONTRADICTION',
          strategy: 'CONTRADICTION',
          targetClaimId: 'claim_1',
          reason: '职责表述前后冲突，需要先澄清',
        };
      }
      return {
        action: 'FOLLOW_UP',
        strategy: 'EVIDENCE',
        targetClaimId: 'claim_1',
        reason: '高重要性 Claim 缺少量化证据',
      };
    }
    if (prompt.includes('生成面试开场白')) {
      return { opening: '你好，我是今天的面试官。第一题：请介绍订单链路项目里 API 设计的关键取舍。' };
    }
    if (system.includes('面试官')) {
      if (overrides.interviewer) return overrides.interviewer(prompt);
      const isClarify = prompt.includes('"action": "CLARIFY_CONTRADICTION"');
      return {
        acknowledgement: isClarify
          ? '这里我需要先澄清一个信息差。'
          : '明白，我们聚焦到刚才那个点。',
        nextQuestion: isClarify
          ? '你刚才说没有参与核心设计——这和之前的表述冲突，这部分到底是不是你本人负责？'
          : '你提到负责核心链路重构，请给出优化前后的 baseline 和指标口径。',
        quotedFromAnswer: '核心链路重构',
      };
    }
    if (system.includes('复盘报告')) {
      return {
        summary: '整体表达清晰，但已验证 Claim 偏少，量化证据是最大短板。',
        strengths: ['能主动说明职责边界'],
        weaknesses: ['缺少 baseline 与指标口径'],
        evidenceLinks: [],
      };
    }
    if (system.includes('训练记忆')) {
      return {
        entries: [
          { kind: 'training_focus', conclusion: '需要练习给出 baseline 与指标口径' },
        ],
      };
    }
    throw new Error(`unrouted system prompt: ${system.slice(0, 40)}`);
  };

  return {
    hasProvider: () => true,
    chatJson: jest.fn(async ({ messages }: { messages: ChatMessage[] }) => ({
      content: JSON.stringify(route(messages[0].content, messages[1].content)),
      promptTokens: 10,
      completionTokens: 10,
      durationMs: 5,
      model: 'mock',
    })),
  } as unknown as LlmClientService;
}

function buildService(llm: LlmClientService, store: SessionStoreService) {
  const trace = new AgentTraceService();
  const structured = new StructuredOutputService(llm);
  return new InterviewAgentService(
    {} as ConstructorParameters<typeof InterviewAgentService>[0],
    store,
    trace,
    llm,
    {} as ConstructorParameters<typeof InterviewAgentService>[4],
    {} as ConstructorParameters<typeof InterviewAgentService>[5],
    {} as ConstructorParameters<typeof InterviewAgentService>[6],
    {} as ConstructorParameters<typeof InterviewAgentService>[7],
    {} as ConstructorParameters<typeof InterviewAgentService>[8],
    new ClaimExtractorService(structured, trace),
    new AnswerJudgeService(structured, trace),
    new NextActionPolicyService(structured, trace),
    new InterviewerService(structured, trace),
    new SessionMemoryService(),
    new ReportGeneratorService(structured, trace),
    new LongTermMemoryService(structured, trace),
  );
}

describe('InterviewAgentService dialogue loop (LLM-content, rule-guarded)', () => {
  const originalCwd = process.cwd();
  let dir: string;
  let store: SessionStoreService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resume-agent-loop-'));
    process.chdir(dir);
    store = new SessionStoreService();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('hard rules override the LLM: follow-up depth cap forces SWITCH_TOPIC even when policy LLM keeps choosing FOLLOW_UP', async () => {
    const service = buildService(routedLlm(), store);
    const session = preparedSession(store);

    const started = await service.start(session.sessionId);
    expect(started.action).toBe('ASK_MAIN');
    expect(started.progress.questionCount).toBe(1);

    const answer = '我负责订单服务的核心链路重构，把同步调用拆成了异步批处理。';
    const first = await service.answer(session.sessionId, { answer });
    expect(first.action).toBe('FOLLOW_UP');
    expect(first.nextQuestion).toContain('baseline');

    const second = await service.answer(session.sessionId, { answer });
    expect(second.action).toBe('FOLLOW_UP');

    // 第三轮 followUpDepth=2 触发硬规则，policy LLM 甚至不会被问到
    const third = await service.answer(session.sessionId, { answer });
    expect(third.action).toBe('SWITCH_TOPIC');
    expect(third.nextQuestion).toContain('缓存');

    const saved = store.get(session.sessionId);
    const thirdTurn = saved.turns.filter((t) => t.answerText)[2];
    expect(thirdTurn.decision?.ruleTriggered).toBe('MAX_FOLLOWUP_DEPTH');
    expect(saved.memory.claims.length).toBeGreaterThan(0);
    expect(saved.memory.unresolvedIssues.length).toBeGreaterThan(0);
  });

  it('clamps an out-of-set LLM policy choice to the legal action set', async () => {
    const llm = routedLlm({
      // 策略 LLM 试图选不在合法集合里的 SUMMARIZE
      policy: () => ({ action: 'SUMMARIZE', reason: '我想总结一下' }),
    });
    const service = buildService(llm, store);
    const session = preparedSession(store);
    await service.start(session.sessionId);

    const result = await service.answer(session.sessionId, {
      answer: '我负责订单服务的核心链路重构。',
    });
    expect(['FOLLOW_UP', 'CHALLENGE', 'SWITCH_TOPIC', 'CLARIFY_CONTRADICTION']).toContain(
      result.action,
    );
    const saved = store.get(session.sessionId);
    expect(saved.turns[0].decision?.ruleTriggered).toBe('LLM_ACTION_OUT_OF_SET');
  });

  it('clarifies contradiction when a later answer denies an ownership claim', async () => {
    const service = buildService(routedLlm(), store);
    const session = preparedSession(store);
    await service.start(session.sessionId);

    await service.answer(session.sessionId, {
      answer: '我负责设计核心链路，整体性能提升 20%。',
    });
    const second = await service.answer(session.sessionId, {
      answer: '其实这部分不是我负责，我没参与核心设计。',
    });
    expect(second.action).toBe('CLARIFY_CONTRADICTION');
    expect(second.nextQuestion).toContain('本人负责');

    const saved = store.get(session.sessionId);
    expect(
      saved.memory.claims.some((claim) => claim.status === 'CONTRADICTED'),
    ).toBe(true);
  });

  it('rolls back the turn when LLM content generation fails mid-pipeline', async () => {
    let failJudge = true;
    const llm = routedLlm({
      judge: () => {
        if (failJudge) throw new Error('boom');
        return null;
      },
    });
    // judge 路由抛错 → chatJson reject → 视为不可用
    (llm.chatJson as jest.Mock).mockImplementation(
      async ({ messages }: { messages: ChatMessage[] }) => {
        if (messages[0].content.includes('评审官') && failJudge) return null;
        const base = routedLlm();
        return (base.chatJson as jest.Mock)({ messages });
      },
    );
    const service = buildService(llm, store);
    const session = preparedSession(store);
    await service.start(session.sessionId);

    await expect(
      service.answer(session.sessionId, { answer: '我负责核心链路重构。' }),
    ).rejects.toThrow('AI 面试官暂时不可用');

    // 失败未落盘：当前问题仍处于未回答状态，可直接重试
    const saved = store.get(session.sessionId);
    const unanswered = saved.turns.find((t) => !t.answerText);
    expect(unanswered).toBeDefined();

    failJudge = false;
    const retried = await service.answer(session.sessionId, {
      answer: '我负责核心链路重构。',
    });
    expect(retried.action).toBe('FOLLOW_UP');
  });

  it('refuses to create a session when no LLM provider is configured', () => {
    const noProvider = {
      hasProvider: () => false,
      chatJson: jest.fn(),
    } as unknown as LlmClientService;
    const service = buildService(noProvider, store);
    expect(() =>
      service.createSession({
        resumeFileId: 'rf_1',
        company: 'Acme',
        position: 'Backend Engineer',
        jobDescription: '',
        interviewRound: 'tech_first',
        mode: 'realistic',
        maxQuestions: 5,
      }),
    ).toThrow('深度面试需要 LLM 服务');
  });

  it('generates a traceable report and long-term memory after completion', async () => {
    const service = buildService(routedLlm(), store);
    const session = preparedSession(store);
    await service.start(session.sessionId);
    await service.answer(session.sessionId, {
      answer: '我负责设计核心链路，性能提升 20%，baseline 是原同步链路。',
    });
    await service.end(session.sessionId);

    const report = await service.getReport(session.sessionId);
    expect(report.summary).toContain('量化证据');
    expect(report.evidenceLinks.some((item) => item.turnId)).toBe(true);
    expect(report.claimSummary?.length).toBeGreaterThan(0);

    const memory = service.listLongTermMemory('rf_1');
    expect(memory.some((entry) => entry.conclusion.includes('baseline'))).toBe(true);

    // 重复 end 幂等：不重复提炼
    await service.end(session.sessionId);
    const again = service.listLongTermMemory('rf_1');
    expect(again.filter((e) => e.conclusion.includes('baseline'))[0]?.occurrences).toBe(1);

    const deleted = service.deleteLongTermMemory(memory[0].id);
    expect(deleted.deletedId).toBe(memory[0].id);
  });

  it('rejects report access before the interview is completed', async () => {
    const service = buildService(routedLlm(), store);
    const session = preparedSession(store);
    await service.start(session.sessionId);
    await expect(service.getReport(session.sessionId)).rejects.toThrow('completed');
  });

  it('does not leak plan or judge internals in the session response', async () => {
    const service = buildService(routedLlm(), store);
    const session = preparedSession(store);
    await service.start(session.sessionId);
    await service.answer(session.sessionId, {
      answer: '我负责设计链路，性能提升 20%。',
    });

    const response = service.getSession(session.sessionId);
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('mainQuestionPool');
    expect(serialized).not.toContain('rubric');
    expect(serialized).not.toContain('evidenceGaps');
    expect(serialized).not.toContain('informationGain');
    expect(response.progress.questionPoolSize).toBeGreaterThan(0);
    expect(response.traceTail.length).toBeGreaterThan(0);
  });
});

function preparedSession(store: SessionStoreService): InterviewAgentSessionDoc {
  const resume: SanitizedResume = {
    basics: { summary: 'backend engineer' },
    customSections: [],
  };
  const session = store.create(
    {
      resumeFileId: 'rf_1',
      company: 'Acme',
      position: 'Backend Engineer',
      jobDescription: 'Build APIs and cache systems',
      interviewRound: 'tech_first',
      mode: 'realistic',
      maxQuestions: 5,
    },
    resume,
  );
  session.status = 'READY';
  session.jdMatrix = {
    competencies: [
      {
        id: 'comp_api',
        name: 'API设计',
        category: 'engineering',
        importance: 5,
        questionRatio: 0.5,
        evidenceKeywords: ['接口', '链路'],
      },
      {
        id: 'comp_cache',
        name: '缓存设计',
        category: 'engineering',
        importance: 4,
        questionRatio: 0.5,
        evidenceKeywords: ['缓存'],
      },
    ],
  };
  session.plan = {
    competencyPriorities: [
      { competencyId: 'comp_api', priority: 5, targetQuestionCount: 2 },
      { competencyId: 'comp_cache', priority: 4, targetQuestionCount: 2 },
    ],
    focusProjects: ['project_1'],
    highRiskClaims: ['claim_1'],
    mainQuestionPool: [
      {
        id: 'main_1',
        question: '请介绍订单链路项目里 API 设计的关键取舍。',
        competencyIds: ['comp_api'],
        targetProjectId: 'project_1',
        targetClaimIds: ['claim_1'],
        objective: '验证API设计能力',
        followUpDirections: ['EVIDENCE', 'IMPLEMENTATION'],
        difficulty: 'medium',
        rubric: [],
        styleEvidence: ['source_1'],
      },
      {
        id: 'main_2',
        question: '请说明你在缓存一致性问题上的处理方案。',
        competencyIds: ['comp_cache'],
        targetProjectId: 'project_1',
        targetClaimIds: [],
        objective: '验证缓存设计能力',
        followUpDirections: ['RATIONALE'],
        difficulty: 'medium',
        rubric: [],
        styleEvidence: ['source_1'],
      },
    ],
    difficultyDistribution: { easy: 0.2, medium: 0.6, hard: 0.2 },
    stopConditions: {
      maxQuestions: 5,
      maxFollowUpPerQuestion: 2,
      coverageThreshold: 0.8,
    },
  };
  session.memory.claims.push({
    id: 'claim_1',
    content: '负责订单链路 API 设计并主导性能优化',
    status: 'UNVERIFIED',
    sourceTurnIds: [],
    relatedProjectId: 'project_1',
    relatedCompetencyIds: ['comp_api'],
    importance: 5,
  });
  store.save(session);
  return session;
}
