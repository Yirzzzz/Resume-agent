import { Injectable } from '@nestjs/common';
import type {
  InterviewAgentSessionDoc,
  InterviewPlan,
  MainQuestion,
} from '../types/interview-agent.types';
import { AgentTraceService } from '../tracing/agent-trace.service';

export interface PlanVerdict {
  pass: boolean;
  feedback: string;
}

/**
 * 计划质检：覆盖度 / 重复度 / 简历锚定率的确定性检查。
 * 不合格时给出可执行的反馈供 planner 重写；最终 finalize 兜底补齐题池。
 */
@Injectable()
export class PlanReviewerService {
  constructor(private readonly trace: AgentTraceService) {}

  check(session: InterviewAgentSessionDoc, plan: InterviewPlan): PlanVerdict {
    const problems: string[] = [];
    const pool = plan.mainQuestionPool;
    const minPool = Math.min(4, session.input.maxQuestions);

    if (pool.length < minPool) {
      problems.push(`题池只有 ${pool.length} 题，至少需要 ${minPool} 题`);
    }

    const uniqueCount = new Set(
      pool.map((q) => q.question.replace(/\s+/g, '').toLowerCase()),
    ).size;
    if (pool.length > 0 && uniqueCount / pool.length < 0.8) {
      problems.push(`题目重复率过高（唯一题 ${uniqueCount}/${pool.length}），请去重并补充不同角度的题`);
    }

    const anchored = pool.filter(
      (q) => q.targetProjectId || q.targetClaimIds.length > 0,
    ).length;
    if (pool.length > 0 && anchored / pool.length < 0.5) {
      problems.push(
        `只有 ${anchored}/${pool.length} 题锚定了简历项目或待验证 Claim，至少一半的题必须落到候选人具体经历上`,
      );
    }

    const coreIds = (session.jdMatrix?.competencies ?? [])
      .filter((c) => c.category === 'core' || c.importance >= 4)
      .map((c) => c.id);
    if (coreIds.length > 0) {
      const coveredCore = coreIds.filter((id) =>
        pool.some((q) => q.competencyIds.includes(id)),
      );
      if (coveredCore.length / coreIds.length < 0.6) {
        problems.push(
          `核心能力覆盖不足（${coveredCore.length}/${coreIds.length}），请为未覆盖的核心能力补题`,
        );
      }
    }

    return {
      pass: problems.length === 0,
      feedback: problems.join('；'),
    };
  }

  finalize(session: InterviewAgentSessionDoc, plan: InterviewPlan): InterviewPlan {
    const minPool = Math.min(4, session.input.maxQuestions);
    if (plan.mainQuestionPool.length < minPool) {
      // 不用模板题伪装充数：重写两次后仍不足就诚实失败，prepare 可重试
      throw new Error(
        `面试计划题池不足（${plan.mainQuestionPool.length}/${minPool}），LLM 重写两次仍未通过质检`,
      );
    }
    const reviewed = { ...plan };
    const uniqueCount = new Set(
      reviewed.mainQuestionPool.map((q) =>
        q.question.replace(/\s+/g, '').toLowerCase(),
      ),
    ).size;
    this.trace.push(session, {
      step: 'interview_plan_reviewed',
      summary: `计划质检完成：题池 ${reviewed.mainQuestionPool.length} 题，唯一题 ${uniqueCount} 题`,
      from: 'PlanReviewer',
      inputSummary: {
        coverageCompetencies: reviewed.competencyPriorities.length,
        repeatedQuestions: reviewed.mainQuestionPool.length - uniqueCount,
      },
    });
    return reviewed;
  }
}
