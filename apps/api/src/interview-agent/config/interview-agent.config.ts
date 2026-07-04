function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const interviewAgentConfig = {
  maxSearchRounds: envNumber('INTERVIEW_AGENT_MAX_SEARCH_ROUNDS', 3),
  maxPages: envNumber('INTERVIEW_AGENT_MAX_PAGES', 20),
  prepareLlmCallLimit: envNumber('INTERVIEW_AGENT_PREPARE_LLM_LIMIT', 15),
  // 每轮 4 次主调用（抽取/评审/决策/生成）+ schema 校验重试余量
  turnLlmCallLimit: envNumber('INTERVIEW_AGENT_TURN_LLM_LIMIT', 8),
  sessionLlmCallLimit: envNumber('INTERVIEW_AGENT_SESSION_LLM_LIMIT', 80),
  maxFollowUpPerQuestion: envNumber('INTERVIEW_AGENT_MAX_FOLLOW_UP', 2),
  coverageThreshold: envNumber('INTERVIEW_AGENT_COVERAGE_THRESHOLD', 0.8),
  // 大 prompt（风格分析/出题规划）在中档模型上可能超过 30s
  llmTimeoutMs: envNumber('INTERVIEW_AGENT_LLM_TIMEOUT_MS', 60000),
  /** 研究循环认为覆盖充分所需的最少高质量来源数 / 候选题数 */
  minSources: envNumber('INTERVIEW_AGENT_MIN_SOURCES', 3),
  minQuestions: envNumber('INTERVIEW_AGENT_MIN_QUESTIONS', 6),
};
