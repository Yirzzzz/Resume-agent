import { interviewAgentConfig } from '../config/interview-agent.config';
import type { InterviewAgentSessionDoc } from '../types/interview-agent.types';

export type BudgetScope = 'prepare' | 'turn';

/**
 * 每次 LLM 调用前的预算闸门。orchestrator 在 prepare/answer 入口创建，
 * 所有 callStructured 都必须经过它 —— 超限时直接走降级，不再发起调用。
 */
export class LlmBudget {
  private scopeUsed = 0;

  constructor(
    private readonly session: InterviewAgentSessionDoc,
    private readonly scope: BudgetScope,
  ) {}

  /** 还允许再调一次 LLM 吗？（不消耗额度） */
  canSpend(): boolean {
    if (this.session.usage.llmCalls >= interviewAgentConfig.sessionLlmCallLimit) {
      return false;
    }
    const scopeLimit =
      this.scope === 'prepare'
        ? interviewAgentConfig.prepareLlmCallLimit
        : interviewAgentConfig.turnLlmCallLimit;
    return this.scopeUsed < scopeLimit;
  }

  /** 记账一次实际发起的 LLM 调用（含重试的每一次请求） */
  spend(): void {
    this.scopeUsed += 1;
    this.session.usage.llmCalls += 1;
  }

  exhaustedReason(): string {
    if (this.session.usage.llmCalls >= interviewAgentConfig.sessionLlmCallLimit) {
      return `session LLM 调用已达上限 ${interviewAgentConfig.sessionLlmCallLimit}`;
    }
    return this.scope === 'prepare'
      ? `prepare 期 LLM 调用已达上限 ${interviewAgentConfig.prepareLlmCallLimit}`
      : `单轮 LLM 调用已达上限 ${interviewAgentConfig.turnLlmCallLimit}`;
  }
}
