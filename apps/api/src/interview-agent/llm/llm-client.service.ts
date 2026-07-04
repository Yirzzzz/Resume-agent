import { Injectable } from '@nestjs/common';
import { interviewAgentConfig } from '../config/interview-agent.config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  model: string;
}

@Injectable()
export class LlmClientService {
  hasProvider(): boolean {
    return Boolean(this.resolveApiKey());
  }

  async chatJson(params: {
    messages: ChatMessage[];
    temperature?: number;
    timeoutMs?: number;
  }): Promise<LlmCallResult | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) return null;

    // 瞬态失败（超时/429/5xx/网络错误）自动重试一次；鉴权类错误不重试
    const first = await this.attempt(params, apiKey);
    if (first.result || !first.retryable) return first.result;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return (await this.attempt(params, apiKey)).result;
  }

  private async attempt(
    params: {
      messages: ChatMessage[];
      temperature?: number;
      timeoutMs?: number;
    },
    apiKey: string,
  ): Promise<{ result: LlmCallResult | null; retryable: boolean }> {
    const baseUrl = this.resolveBaseUrl().replace(/\/+$/, '');
    const model = this.resolveModel();
    const endpoint = `${baseUrl}/chat/completions`;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      params.timeoutMs ?? interviewAgentConfig.llmTimeoutMs,
    );

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: params.temperature ?? 0.2,
          response_format: { type: 'json_object' },
          messages: params.messages,
        }),
      });
      if (!resp.ok) {
        return {
          result: null,
          retryable: resp.status === 429 || resp.status >= 500,
        };
      }
      const data = (await resp.json()) as Record<string, unknown>;
      return {
        result: {
          content: this.extractTextContent(data),
          promptTokens: this.numberAt(data, ['usage', 'prompt_tokens']),
          completionTokens: this.numberAt(data, ['usage', 'completion_tokens']),
          durationMs: Date.now() - started,
          model,
        },
        retryable: false,
      };
    } catch {
      // AbortError（超时）或网络错误
      return { result: null, retryable: true };
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveApiKey(): string {
    return String(
      process.env.OPENAI_API_KEY ?? process.env.INTERVIEW_API_KEY ?? '',
    ).trim();
  }

  private resolveBaseUrl(): string {
    return String(
      process.env.OPENAI_BASE_URL ??
        process.env.INTERVIEW_BASE_URL ??
        'https://api.openai.com/v1',
    ).trim();
  }

  private resolveModel(): string {
    return String(
      process.env.OPENAI_MODEL ?? process.env.INTERVIEW_MODEL ?? 'gpt-4o-mini',
    ).trim();
  }

  private extractTextContent(data: Record<string, unknown>): string {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0];
    if (first && typeof first === 'object') {
      const message = (first as { message?: { content?: unknown } }).message;
      const content = message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return String((item as { text?: unknown }).text ?? '');
            }
            return '';
          })
          .join('\n')
          .trim();
      }
    }
    const outputText = data.output_text;
    return typeof outputText === 'string' ? outputText : '';
  }

  private numberAt(data: Record<string, unknown>, path: string[]): number {
    let cursor: unknown = data;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object') return 0;
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return typeof cursor === 'number' ? cursor : 0;
  }
}
