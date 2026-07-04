import { z } from 'zod';
import { LlmContentError, StructuredOutputService } from './structured-output';
import type { LlmClientService } from './llm-client.service';

describe('StructuredOutputService', () => {
  it('retries once after invalid JSON and returns validated output', async () => {
    const calls: string[] = [];
    const llm = {
      hasProvider: () => true,
      chatJson: jest
        .fn()
        .mockResolvedValueOnce({
          content: 'not json',
          promptTokens: 1,
          completionTokens: 1,
          durationMs: 10,
          model: 'test',
        })
        .mockResolvedValueOnce({
          content: '{"name":"ok"}',
          promptTokens: 2,
          completionTokens: 2,
          durationMs: 20,
          model: 'test',
        }),
    } as unknown as LlmClientService;
    const service = new StructuredOutputService(llm);

    const result = await service.callStructured({
      system: 'system',
      prompt: 'prompt',
      schema: z.object({ name: z.string() }),
      promptVersion: 'test/v1',
      onTrace: (event) => calls.push(`${event.attempt}:${event.ok ? 'ok' : 'fail'}`),
    });

    expect(result).toEqual({ name: 'ok' });
    expect(calls).toEqual(['first:fail', 'retry:ok']);
  });

  it('throws LlmContentError when the provider call fails (no fake content)', async () => {
    const llm = {
      hasProvider: () => true,
      chatJson: jest.fn().mockResolvedValue(null),
    } as unknown as LlmClientService;
    const service = new StructuredOutputService(llm);

    await expect(
      service.callStructured({
        system: 'system',
        prompt: 'prompt',
        schema: z.object({ name: z.string() }),
        promptVersion: 'test/v1',
      }),
    ).rejects.toThrow(LlmContentError);
    // 不可用时不再浪费重试
    expect(llm.chatJson).toHaveBeenCalledTimes(1);
  });

  it('throws immediately without calling the LLM when no provider is configured', async () => {
    const chatJson = jest.fn();
    const llm = {
      hasProvider: () => false,
      chatJson,
    } as unknown as LlmClientService;
    const service = new StructuredOutputService(llm);

    const events: string[] = [];
    await expect(
      service.callStructured({
        system: 'system',
        prompt: 'prompt',
        schema: z.object({ name: z.string() }),
        promptVersion: 'test/v1',
        onTrace: (event) => events.push(event.attempt),
      }),
    ).rejects.toThrow(LlmContentError);
    expect(chatJson).not.toHaveBeenCalled();
    expect(events).toEqual(['no_provider']);
  });

  it('uses an explicit fallback only when provided (opt-in, not default)', async () => {
    const llm = {
      hasProvider: () => false,
      chatJson: jest.fn(),
    } as unknown as LlmClientService;
    const service = new StructuredOutputService(llm);

    const result = await service.callStructured({
      system: 'system',
      prompt: 'prompt',
      schema: z.object({ name: z.string() }),
      promptVersion: 'test/v1',
      fallback: () => ({ name: 'explicit-fallback' }),
    });
    expect(result).toEqual({ name: 'explicit-fallback' });
  });
});
