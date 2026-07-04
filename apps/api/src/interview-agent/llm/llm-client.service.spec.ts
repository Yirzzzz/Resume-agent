import { LlmClientService } from './llm-client.service';

const ENV_KEYS = [
  'INTERVIEW_API_KEY',
  'INTERVIEW_BASE_URL',
  'INTERVIEW_MODEL',
  'INTERVIEW_ENABLE_THINKING',
  'INTERVIEW_LLM_ENABLE_THINKING',
  'DASHSCOPE_API_KEY',
  'DASHSCOPE_BASE_URL',
  'DASHSCOPE_MODEL',
  'DASHSCOPE_ENABLE_THINKING',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
];

describe('LlmClientService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    global.fetch = jest.fn();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    global.fetch = originalFetch;
  });

  it('uses Interview/DashScope envs and disables thinking for Aliyun compatible JSON calls', async () => {
    process.env.DASHSCOPE_API_KEY = 'dashscope-key';
    process.env.INTERVIEW_BASE_URL =
      'https://llm-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/';
    process.env.INTERVIEW_MODEL = 'deepseek-v4-pro';

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }),
    });

    const service = new LlmClientService();
    const result = await service.chatJson({
      messages: [
        { role: 'system', content: '只输出 JSON' },
        { role: 'user', content: 'ping' },
      ],
    });

    expect(result?.content).toBe('{"ok":true}');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://llm-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer dashscope-key',
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe('deepseek-v4-pro');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.enable_thinking).toBe(false);
  });

  it('keeps provider HTTP errors visible for trace diagnostics', async () => {
    process.env.INTERVIEW_API_KEY = 'interview-key';
    process.env.INTERVIEW_BASE_URL = 'https://example.test/v1';
    process.env.INTERVIEW_MODEL = 'qwen-test';

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            code: 'InvalidParameter',
            type: 'invalid_request_error',
            message: 'messages must contain the word JSON',
          },
        }),
    });

    const service = new LlmClientService();
    const result = await service.chatJson({
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(service.getLastError()).toContain('HTTP 400');
    expect(service.getLastError()).toContain('InvalidParameter');
    expect(service.getLastError()).toContain('messages must contain the word JSON');
  });

  it('keeps timeout duration visible when a provider request is aborted', async () => {
    process.env.INTERVIEW_API_KEY = 'interview-key';
    process.env.INTERVIEW_BASE_URL = 'https://example.test/v1';
    process.env.INTERVIEW_MODEL = 'qwen-test';

    const abortError = new Error('This operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    const service = new LlmClientService();
    const result = await service.chatJson({
      messages: [{ role: 'user', content: 'ping' }],
      timeoutMs: 1234,
    });

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(service.getLastError()).toContain('request_timeout_after_1234ms');
    expect(service.getLastError()).toContain('This operation was aborted');
  });
});
