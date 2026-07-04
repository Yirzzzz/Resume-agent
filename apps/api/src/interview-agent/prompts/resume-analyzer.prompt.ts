import type {
  InterviewAgentSessionDoc,
} from '../types/interview-agent.types';

export function buildResumeAnalyzerPrompt(params: {
  session: InterviewAgentSessionDoc;
}): { system: string; prompt: string } {
  const { session } = params;
  return {
    system:
      '你是简历深度分析器，只输出合法 JSON。你站在面试官立场分析这份简历：哪些经历值得深挖、' +
      '哪些表述有"攻击面"（可能经不起追问）、哪些断言必须在面试中验证。',
    prompt: JSON.stringify(
      {
        task: '分析简历，输出 projects / attackSurface / claimsToVerify。',
        rules: [
          'projects：每段可面试的经历一条，id 用 project_1..n；quantifiedResults 摘录简历中的量化表述原文；keyDecisions 摘录技术选型/架构决策表述',
          'attackSurface：面试官会攻击的薄弱点。kind 说明：missing_baseline=有结果没对照，unclear_ownership=职责不清，vague_method=方法含糊，stack_mismatch=技术栈与JD不符，metric_without_setup=有指标没实验设置，reproduction_only=疑似复现他人工作，confounded_result=结果可能有混杂因素',
          'claimsToVerify：简历中必须验证的具体断言，id 用 claim_1..n，importance 按对岗位评估的重要性',
          'jdRelevance 按 jdCompetencies 判断',
          '只依据简历文本，不要编造简历里没有的内容',
        ],
        outputShape: {
          projects: [
            {
              id: 'project_1',
              name: '项目名称',
              role: '你在其中的角色',
              techStack: ['技术栈'],
              quantifiedResults: ['简历中的量化表述原文'],
              keyDecisions: ['技术选型/架构决策表述'],
              jdRelevance: 'high',
            },
          ],
          attackSurface: [
            {
              id: 'attack_1',
              projectId: 'project_1',
              description: '薄弱点描述',
              kind: 'missing_baseline',
              suggestedProbe: '建议的追问',
            },
          ],
          claimsToVerify: [
            { id: 'claim_1', content: '待验证断言', projectId: 'project_1', importance: 5 },
          ],
        },
        targetPosition: session.input.position,
        jdCompetencies: (session.jdMatrix?.competencies ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          keywords: c.evidenceKeywords,
        })),
        resume: session.resumeSnapshot,
      },
      null,
      2,
    ),
  };
}
