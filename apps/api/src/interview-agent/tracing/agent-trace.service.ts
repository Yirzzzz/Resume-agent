import { Injectable } from '@nestjs/common';
import type {
  AgentTraceEvent,
  InterviewAgentSessionDoc,
} from '../types/interview-agent.types';

@Injectable()
export class AgentTraceService {
  create(params: {
    step: string;
    summary: string;
    from?: string;
    to?: string;
    inputSummary?: unknown;
    promptVersion?: string;
    tool?: string;
    durationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    error?: string;
  }): AgentTraceEvent {
    return {
      id: this.newId('trace'),
      step: params.step,
      summary: params.summary,
      from: params.from,
      to: params.to,
      inputSummary: params.inputSummary,
      promptVersion: params.promptVersion,
      tool: params.tool,
      durationMs: params.durationMs,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      error: params.error,
      createdAt: new Date().toISOString(),
    };
  }

  push(
    session: InterviewAgentSessionDoc,
    params: Parameters<AgentTraceService['create']>[0],
  ): AgentTraceEvent {
    const event = this.create(params);
    session.trace.push(event);
    session.usage.updatedAt = event.createdAt;
    if (event.promptTokens) session.usage.promptTokens += event.promptTokens;
    if (event.completionTokens) {
      session.usage.completionTokens += event.completionTokens;
    }
    return event;
  }

  private newId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
