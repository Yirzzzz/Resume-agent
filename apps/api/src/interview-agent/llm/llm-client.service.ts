import { Injectable } from '@nestjs/common';
import {
  resolveInterviewApiKey,
  resolveInterviewBaseUrl,
  resolveInterviewEnableThinking,
  resolveInterviewModel,
} from '../../llm/interview-provider.config';
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
  private lastError?: string;

  hasProvider(): boolean {
    return Boolean(this.resolveApiKey());
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  async chatJson(params: {
    messages: ChatMessage[];
    temperature?: number;
    timeoutMs?: number;
  }): Promise<LlmCallResult | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) return null;
    this.lastError = undefined;

    // 瞬态失败（超时/429/5xx/网络错误）自动重试一次；鉴权类错误不重试
    const first = await this.attempt(params, apiKey);
    if (first.result || !first.retryable) {
      this.lastError = first.result ? undefined : first.error;
      return first.result;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    const retry = await this.attempt(params, apiKey);
    this.lastError = retry.result ? undefined : retry.error ?? first.error;
    return retry.result;
  }

  private async attempt(
    params: {
      messages: ChatMessage[];
      temperature?: number;
      timeoutMs?: number;
    },
    apiKey: string,
  ): Promise<{ result: LlmCallResult | null; retryable: boolean; error?: string }> {
    const baseUrl = this.resolveBaseUrl();
    const model = this.resolveModel();
    const endpoint = `${baseUrl}/chat/completions`;
    const started = Date.now();
    const controller = new AbortController();
    const timeoutMs = params.timeoutMs ?? interviewAgentConfig.llmTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        temperature: params.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: params.messages,
      };
      const enableThinking = resolveInterviewEnableThinking(baseUrl);
      if (enableThinking !== undefined) {
        body.enable_thinking = enableThinking;
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        return {
          result: null,
          retryable: resp.status === 429 || resp.status >= 500,
          error: await this.readError(resp),
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
    } catch (error) {
      // AbortError（超时）或网络错误
      const message = error instanceof Error ? error.message : 'network_error';
      const isAbort =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          message.toLowerCase().includes('aborted'));
      return {
        result: null,
        retryable: true,
        error: isAbort
          ? `request_timeout_after_${timeoutMs}ms: ${message}`
          : message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveApiKey(): string {
    return resolveInterviewApiKey();
  }

  private resolveBaseUrl(): string {
    return resolveInterviewBaseUrl();
  }

  private resolveModel(): string {
    return resolveInterviewModel();
  }

  private extractTextContent(data: Record<string, unknown>): string {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0];
    if (first && typeof first === 'object') {
      const message = (
        first as { message?: { content?: unknown; reasoning_content?: unknown }; text?: unknown }
      ).message;
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
      if (typeof message?.reasoning_content === 'string') {
        return message.reasoning_content;
      }
      const text = (first as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
    const outputText = data.output_text;
    return typeof outputText === 'string' ? outputText : '';
  }

  private async readError(resp: Response): Promise<string> {
    const prefix = `HTTP ${resp.status}`;
    try {
      const text = await resp.text();
      if (!text.trim()) return prefix;
      let message = text.trim();
      try {
        const parsed = JSON.parse(text) as {
          error?: { message?: unknown; code?: unknown; type?: unknown };
          message?: unknown;
        };
        const parts = [
          parsed.error?.code,
          parsed.error?.type,
          parsed.error?.message,
          parsed.message,
        ]
          .map((part) => String(part ?? '').trim())
          .filter(Boolean);
        if (parts.length) message = parts.join(': ');
      } catch {
        // Keep raw provider text when it is not JSON.
      }
      return `${prefix}: ${message.slice(0, 600)}`;
    } catch {
      return prefix;
    }
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
