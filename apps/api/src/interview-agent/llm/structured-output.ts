import { Injectable } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { LlmClientService } from './llm-client.service';
import type { LlmBudget } from './llm-budget';

export interface StructuredTraceEvent {
  ok: boolean;
  attempt: 'first' | 'retry' | 'budget_exhausted' | 'no_provider';
  promptVersion: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

/** LLM 内容生成失败（不可用/超预算/两次都没通过校验）。深度面试不降级为规则内容，直接对外报错。 */
export class LlmContentError extends Error {
  constructor(
    readonly kind: 'no_provider' | 'budget_exhausted' | 'generation_failed',
    message: string,
  ) {
    super(message);
    this.name = 'LlmContentError';
  }
}

@Injectable()
export class StructuredOutputService {
  constructor(private readonly llm: LlmClientService) {}

  /**
   * LLM 结构化输出统一入口：预算闸门 → 调用 → zod 校验 → 带错误重试1次。
   * 不传 fallback 时失败直接抛 LlmContentError —— 内容永远不由规则模板伪造。
   */
  async callStructured<T>(params: {
    system: string;
    prompt: string;
    schema: ZodType<T, ZodTypeDef, unknown>;
    promptVersion: string;
    budget?: LlmBudget;
    temperature?: number;
    fallback?: () => T;
    onTrace?: (event: StructuredTraceEvent) => void;
  }): Promise<T> {
    if (!this.llm.hasProvider()) {
      params.onTrace?.({
        ok: false,
        attempt: 'no_provider',
        promptVersion: params.promptVersion,
        error: 'llm_unavailable',
      });
      return this.settle(
        params,
        new LlmContentError(
          'no_provider',
          '未配置 LLM 服务（INTERVIEW_API_KEY / DASHSCOPE_API_KEY / OPENAI_API_KEY）',
        ),
      );
    }
    if (params.budget && !params.budget.canSpend()) {
      params.onTrace?.({
        ok: false,
        attempt: 'budget_exhausted',
        promptVersion: params.promptVersion,
        error: params.budget.exhaustedReason(),
      });
      return this.settle(
        params,
        new LlmContentError('budget_exhausted', params.budget.exhaustedReason()),
      );
    }

    params.budget?.spend();
    const first = await this.tryCall(params);
    params.onTrace?.({
      ok: Boolean(first.value),
      attempt: 'first',
      promptVersion: params.promptVersion,
      durationMs: first.durationMs,
      promptTokens: first.promptTokens,
      completionTokens: first.completionTokens,
      error: first.error,
    });
    if (first.value !== null && first.value !== undefined) return first.value;
    if (
      first.error?.startsWith('llm_unavailable') ||
      (params.budget && !params.budget.canSpend())
    ) {
      return this.settle(
        params,
        new LlmContentError(
          'generation_failed',
          `LLM 调用失败：${first.error ?? 'unknown'}`,
        ),
      );
    }

    const retryPrompt = `${params.prompt}

上一次输出未通过 JSON schema 校验。请只返回一个合法 JSON 对象，不要包含 Markdown 代码块或解释文字。解析错误：${first.error ?? 'unknown'}`;
    params.budget?.spend();
    const retry = await this.tryCall({ ...params, prompt: retryPrompt });
    params.onTrace?.({
      ok: Boolean(retry.value),
      attempt: 'retry',
      promptVersion: params.promptVersion,
      durationMs: retry.durationMs,
      promptTokens: retry.promptTokens,
      completionTokens: retry.completionTokens,
      error: retry.error,
    });
    if (retry.value !== null && retry.value !== undefined) return retry.value;
    return this.settle(
      params,
      new LlmContentError(
        'generation_failed',
        `LLM 输出两次均未通过校验：${retry.error ?? 'unknown'}`,
      ),
    );
  }

  private settle<T>(params: { fallback?: () => T }, error: LlmContentError): T {
    if (params.fallback) return params.fallback();
    throw error;
  }

  private async tryCall<T>(params: {
    system: string;
    prompt: string;
    schema: ZodType<T, ZodTypeDef, unknown>;
    temperature?: number;
  }): Promise<{
    value: T | null;
    durationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    error?: string;
  }> {
    const result = await this.llm.chatJson({
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.prompt },
      ],
      temperature: params.temperature,
    });
    if (!result) {
      const detail =
        typeof this.llm.getLastError === 'function'
          ? this.llm.getLastError()
          : undefined;
      return {
        value: null,
        error: detail ? `llm_unavailable: ${detail}` : 'llm_unavailable',
      };
    }
    const parsedJson = this.tryParseJson(result.content);
    if (parsedJson === null) {
      return {
        value: null,
        durationMs: result.durationMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        error: 'invalid_json',
      };
    }
    const parsed = params.schema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        value: null,
        durationMs: result.durationMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      };
    }
    return {
      value: parsed.data,
      durationMs: result.durationMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  private tryParseJson(text: string): unknown | null {
    const raw = text.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
