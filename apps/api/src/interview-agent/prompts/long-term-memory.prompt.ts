import type {
  InterviewAgentSessionDoc,
  InterviewReport,
  LongTermMemoryEntry,
} from '../types/interview-agent.types';

export function buildLongTermMemoryPrompt(params: {
  session: InterviewAgentSessionDoc;
  report: InterviewReport;
  existingEntries: LongTermMemoryEntry[];
}): { system: string; prompt: string } {
  const { session, report, existingEntries } = params;
  return {
    system:
      '你是跨会话训练记忆提炼器，只输出合法 JSON。你从单场模拟面试中提炼值得跨场记住的抽象结论' +
      '（如「回答实验设计类问题时说不清控制变量」），供下一场面试针对性训练。' +
      '只存抽象结论，不复述对话原文；与 existingEntries 语义重复的不要再输出。',
    prompt: JSON.stringify(
      {
        task: '提炼 0-6 条长期记忆条目。宁缺毋滥：没有跨场价值就返回空数组。',
        kinds: {
          recurring_weakness: '反复出现的薄弱模式',
          improvement: '相比历史记录有明确进步的点',
          trained_project: '已经训练到可稳定表达的项目/Claim',
          training_focus: '下一场应该重点训练的方向',
        },
        outputShape: {
          entries: [{ kind: 'training_focus', conclusion: '抽象训练结论（≤200字）' }],
        },
        report: {
          summary: report.summary,
          strengths: report.strengths,
          weaknesses: report.weaknesses,
        },
        contradictedClaims: session.memory.claims
          .filter((c) => c.status === 'CONTRADICTED')
          .map((c) => c.content),
        openIssues: session.memory.unresolvedIssues
          .filter((i) => !i.resolvedAtTurnId)
          .map((i) => i.description),
        existingEntries: existingEntries.slice(0, 20).map((e) => ({
          kind: e.kind,
          conclusion: e.conclusion,
        })),
      },
      null,
      2,
    ),
  };
}
