import type {
  EvidenceSource,
  InterviewAgentSessionDoc,
  ResearchFindings,
} from '../types/interview-agent.types';

export function buildStyleAnalystPrompt(params: {
  session: InterviewAgentSessionDoc;
  sources: EvidenceSource[];
  questions: ResearchFindings['extractedQuestions'];
}): { system: string; prompt: string } {
  const { session, sources, questions } = params;
  return {
    system:
      '你是公司面试风格分析师，只输出合法 JSON。你从真实面经问题中归纳这家公司这个岗位的面试风格画像。' +
      '结论必须由 sources/questions 支撑：basedOnSourceIds 与 frequentTopics.sourceIds 只能引用给定的 source id。' +
      '证据不足的维度用保守默认值并降低 confidence，禁止编造。',
    prompt: JSON.stringify(
      {
        task: '归纳 CompanyStyleProfile：题型分布、技术深度、高频话题、项目追问套路、压力风格、轮次差异。',
        rules: [
          'questionTypeDistribution 的 key 从问题中归纳（如 project_deep_dive / algorithm / system_design / basics / behavioral），value 为占比且总和约 1',
          'projectProbePatterns 写这家公司追问项目的具体套路，要能从 questions 中看出来',
          'pressureStyle：面经中出现连环追问/挑战性措辞多 → aggressive；否则 normal/relaxed',
          'confidence：来源多且一致 → 高；来源少或都是低层级来源 → ≤0.5',
        ],
        outputShape: {
          questionTypeDistribution: { project_deep_dive: 0.4, system_design: 0.3, basics: 0.3 },
          technicalDepth: 'medium',
          frequentTopics: [{ topic: '话题', frequency: 3, sourceIds: ['source_1'] }],
          projectProbePatterns: ['追问套路描述'],
          focusFlags: { engineering: true, theory: false, experimentDesign: false, systemDesign: true },
          pressureStyle: 'normal',
          roundDifferences: [{ round: 'tech_first', emphasis: '侧重点' }],
          basedOnSourceIds: ['source_1'],
          confidence: 0.7,
        },
        company: session.input.company,
        position: session.input.position,
        round: session.input.interviewRound,
        sources: sources.map((s) => ({
          id: s.id,
          title: s.title,
          domain: s.domain,
          tier: s.tier,
          credibility: s.credibility,
        })),
        questions: questions.slice(0, 60),
      },
      null,
      2,
    ),
  };
}
