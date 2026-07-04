import type { InterviewAgentSessionDoc } from '../types/interview-agent.types';

export function buildReportPrompt(params: {
  session: InterviewAgentSessionDoc;
}): { system: string; prompt: string } {
  const { session } = params;
  const turns = session.turns
    .filter((t) => t.answerText)
    .map((t) => ({
      turnId: t.turnId,
      question: t.question,
      answerExcerpt: String(t.answerText).slice(0, 400),
      informationGain: t.judge?.informationGain,
      action: t.decision?.action,
    }));
  return {
    system:
      '你是面试复盘报告撰写人，只输出合法 JSON。报告是写给候选人自己看的训练复盘：' +
      '每条结论必须在 evidenceLinks 挂 turnId 或 claimId，禁止无证据的笼统评价。语气直接、可执行。',
    prompt: JSON.stringify(
      {
        task: '生成复盘报告 summary / strengths / weaknesses / evidenceLinks。',
        rules: [
          'summary：3-5 句，先总体判断，再最关键的 1-2 个提升点',
          'strengths/weaknesses：每条都要具体到某个回答或某个 Claim，且给出正式面试中的应对建议',
          'evidenceLinks 的 turnId/claimId 只能引用给定数据',
        ],
        outputShape: {
          summary: '3-5句总体复盘',
          strengths: ['具体优势+应对建议'],
          weaknesses: ['具体短板+改进建议'],
          evidenceLinks: [{ turnId: 'turn_x', claimId: 'claim_x（可省略）', note: '结论依据' }],
        },
        position: session.input.position,
        company: session.input.company,
        turns,
        claims: session.memory.claims.map((c) => ({
          claimId: c.id,
          content: c.content,
          status: c.status,
        })),
        competencies: session.memory.competencies,
        unresolvedIssues: session.memory.unresolvedIssues.filter(
          (i) => !i.resolvedAtTurnId,
        ),
      },
      null,
      2,
    ),
  };
}
