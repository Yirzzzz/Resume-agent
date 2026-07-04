import type {
  InterviewAgentSessionDoc,
  InterviewTurn,
} from '../types/interview-agent.types';

export function buildClaimExtractorPrompt(params: {
  session: InterviewAgentSessionDoc;
  turn: InterviewTurn;
  answerText: string;
}): { system: string; prompt: string } {
  const { session, turn, answerText } = params;
  const existingClaims = session.memory.claims.slice(-30).map((c) => ({
    id: c.id,
    content: c.content,
    status: c.status,
  }));

  return {
    system:
      '你是面试断言（Claim）抽取器，只输出合法 JSON。Claim 是候选人做出的、面试官后续可以验证或挑战的具体断言，' +
      '如「我负责了 X 模块」「延迟降低了 40%」「当时选择了 A 方案而不是 B」。背景铺垫、客套话不是 Claim。',
    prompt: JSON.stringify(
      {
        task: '从候选人回答中抽取 0-6 条可验证断言，并判断是否与已有 Claim 重复。',
        rules: [
          'content 用候选人自己的表述改写为独立可验证的一句话',
          'kind：ownership=职责归属，metric=量化结果，decision=技术选型/取舍，implementation=实现细节，experience=经历事实',
          'importance：对评估该候选人真实水平的重要程度，量化结果和职责归属通常更重要',
          '若语义上与 existingClaims 中某条是同一断言（哪怕措辞不同），在 matchesExistingClaimId 填那条的 id',
          '回答太空泛没有断言时返回空数组，不要硬凑',
        ],
        outputShape: {
          claims: [
            {
              content: '独立可验证的一句话断言',
              kind: 'metric',
              importance: 4,
              matchesExistingClaimId: 'claim_x（仅当与已有 Claim 重复时给出，否则省略此字段）',
            },
          ],
        },
        question: turn.question,
        candidateAnswer: answerText,
        existingClaims,
      },
      null,
      2,
    ),
  };
}
