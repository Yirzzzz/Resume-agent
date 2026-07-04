import { interviewAgentConfig } from './interview-agent.config';

describe('interviewAgentConfig', () => {
  const originalTimeout = process.env.INTERVIEW_AGENT_LLM_TIMEOUT_MS;

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.INTERVIEW_AGENT_LLM_TIMEOUT_MS;
    } else {
      process.env.INTERVIEW_AGENT_LLM_TIMEOUT_MS = originalTimeout;
    }
  });

  it('reads LLM timeout from env at access time', () => {
    process.env.INTERVIEW_AGENT_LLM_TIMEOUT_MS = '135000';
    expect(interviewAgentConfig.llmTimeoutMs).toBe(135000);

    process.env.INTERVIEW_AGENT_LLM_TIMEOUT_MS = '90000';
    expect(interviewAgentConfig.llmTimeoutMs).toBe(90000);
  });

  it('defaults LLM timeout to 120 seconds for large prepare prompts', () => {
    delete process.env.INTERVIEW_AGENT_LLM_TIMEOUT_MS;
    expect(interviewAgentConfig.llmTimeoutMs).toBe(120000);
  });
});

