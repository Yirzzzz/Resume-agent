import type {
  InterviewAgentSessionDoc,
  InterviewTurn,
  MainQuestion,
  PolicyDecision,
} from '../types/interview-agent.types';

const modeGuide: Record<string, string> = {
  gentle: '语气友善、鼓励式，追问点到为止',
  realistic: '语气专业中性，像真实一线面试官一样直接',
  pressure: '语气紧凑有压迫感，允许直接指出回答的薄弱处并连续压细节，但不进行人身评价',
};

export function buildInterviewerTurnPrompt(params: {
  session: InterviewAgentSessionDoc;
  answeredTurn: InterviewTurn;
  answerText: string;
  decision: PolicyDecision;
  nextMainQuestion?: MainQuestion;
  targetClaimContent?: string;
}): { system: string; prompt: string } {
  const { session, answeredTurn, answerText, decision, nextMainQuestion, targetClaimContent } =
    params;

  return {
    system:
      `你是${session.input.company || '目标公司'}的${session.input.position}面试官，只输出合法 JSON。` +
      `${modeGuide[session.input.mode] ?? modeGuide.realistic}。` +
      '你说话像真人面试官：先简短回应候选人刚说的内容（acknowledgement，1-2 句），再提出下一个问题（nextQuestion）。' +
      '追问时必须引用候选人回答中的具体表述（quotedFromAnswer），让候选人明确知道你在挖哪一点。禁止评分、禁止剧透评价结论。',
    prompt: JSON.stringify(
      {
        task: '根据决策生成自然的面试官回应和下一问。',
        actionSemantics: {
          FOLLOW_UP: '沿着回答中的具体点深挖，按 strategy 的方向问出可验证的细节',
          CHALLENGE: '对候选人方案的合理性提出有依据的质疑，要求给出判断依据或对比',
          CLARIFY_CONTRADICTION: '指出表述与之前信息的出入（不指责），要求候选人澄清事实和职责边界',
          SWITCH_TOPIC: '自然收尾当前话题，衔接到 nextMainQuestion（可按公司风格微调措辞，但不改变考察点）',
          ASK_MAIN: '直接提出 nextMainQuestion',
        },
        strategyHints: {
          EVIDENCE: '要 baseline、指标口径、验证方法',
          IMPLEMENTATION: '要数据流、模块边界、异常处理',
          RATIONALE: '要选型依据、被放弃的替代方案、权衡',
          OWNERSHIP: '要个人 vs 团队的职责切分',
          FAILURE: '要失败案例、踩坑与复盘',
          CONTROL: '要控制变量、实验设置',
          COUNTERFACTUAL: '要"如果不这样做会怎样"的反事实分析',
          GENERALIZATION: '把方案迁移到更大规模/不同约束下检验',
          CONTRADICTION: '澄清矛盾表述',
          DIFFICULTY: '上探更难的变体问题',
        },
        outputShape: {
          acknowledgement: '对候选人刚才回答的简短自然回应（1-2句）',
          nextQuestion: '完整的下一问文本',
          quotedFromAnswer: '从回答中引用的原文片段',
        },
        decision: {
          action: decision.action,
          strategy: decision.strategy,
          reason: decision.reason,
        },
        targetClaim: targetClaimContent,
        previousQuestion: answeredTurn.question,
        candidateAnswer: answerText,
        nextMainQuestion: nextMainQuestion
          ? { question: nextMainQuestion.question, objective: nextMainQuestion.objective }
          : undefined,
      },
      null,
      2,
    ),
  };
}

export function buildOpeningPrompt(params: {
  session: InterviewAgentSessionDoc;
  firstQuestion: string;
}): { system: string; prompt: string } {
  const { session, firstQuestion } = params;
  return {
    system:
      `你是${session.input.company || '目标公司'}的${session.input.position}面试官，只输出合法 JSON。` +
      `${modeGuide[session.input.mode] ?? modeGuide.realistic}。`,
    prompt: JSON.stringify(
      {
        task: '生成面试开场白（opening）：自我定位一句 + 面试节奏说明一句 + 自然引出第一题。第一题原文必须完整包含在 opening 结尾。',
        outputShape: { opening: '开场白全文，结尾包含第一题原文' },
        round: session.input.interviewRound,
        firstQuestion,
      },
      null,
      2,
    ),
  };
}
