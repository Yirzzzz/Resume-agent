import type {
  InterviewAgentSessionDoc,
  SessionInput,
  SessionStatus,
} from '../types/interview-agent.types';

/** trace 对外只暴露步骤级摘要，不含 inputSummary/error 等内部信号 */
export interface SanitizedTraceEvent {
  id: string;
  step: string;
  summary: string;
  from?: string;
  to?: string;
  createdAt: string;
}

/**
 * 对外会话响应：只含进度计数与脱敏 trace。
 * 题库/rubric/研究原文/评审信号属于面试官内部状态，不出网。
 */
export class SessionResponseDto {
  sessionId = '';

  status: SessionStatus = 'CREATED';

  input!: SessionInput;

  progress!: {
    traceCount: number;
    questionPoolSize: number;
    sourceCount: number;
    degraded: boolean;
    turnCount: number;
    answeredCount: number;
  };

  usage!: InterviewAgentSessionDoc['usage'];

  traceTail: SanitizedTraceEvent[] = [];
}
