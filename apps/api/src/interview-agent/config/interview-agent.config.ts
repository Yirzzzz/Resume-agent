function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const interviewAgentConfig = {
  get maxSearchRounds() {
    return envNumber('INTERVIEW_AGENT_MAX_SEARCH_ROUNDS', 3);
  },
  get maxPages() {
    return envNumber('INTERVIEW_AGENT_MAX_PAGES', 20);
  },
  get prepareLlmCallLimit() {
    return envNumber('INTERVIEW_AGENT_PREPARE_LLM_LIMIT', 15);
  },
  // 每轮 4 次主调用（抽取/评审/决策/生成）+ schema 校验重试余量
  get turnLlmCallLimit() {
    return envNumber('INTERVIEW_AGENT_TURN_LLM_LIMIT', 8);
  },
  get sessionLlmCallLimit() {
    return envNumber('INTERVIEW_AGENT_SESSION_LLM_LIMIT', 80);
  },
  get maxFollowUpPerQuestion() {
    return envNumber('INTERVIEW_AGENT_MAX_FOLLOW_UP', 2);
  },
  get coverageThreshold() {
    return envNumber('INTERVIEW_AGENT_COVERAGE_THRESHOLD', 0.8);
  },
  // 大 prompt（风格分析/出题规划）在百炼等兼容接口上可能超过 60s
  get llmTimeoutMs() {
    return envNumber('INTERVIEW_AGENT_LLM_TIMEOUT_MS', 120000);
  },
  /** 研究循环认为覆盖充分所需的最少高质量来源数 / 候选题数 */
  get minSources() {
    return envNumber('INTERVIEW_AGENT_MIN_SOURCES', 3);
  },
  get minQuestions() {
    return envNumber('INTERVIEW_AGENT_MIN_QUESTIONS', 6);
  },
};
