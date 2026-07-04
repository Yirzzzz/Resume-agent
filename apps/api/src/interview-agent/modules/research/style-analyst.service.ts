import { Injectable } from '@nestjs/common';
import { styleProfileSchema } from '../../schemas/style-profile.schema';
import type { StyleProfileOutput } from '../../schemas/style-profile.schema';
import { buildStyleAnalystPrompt } from '../../prompts/style-analyst.prompt';
import { promptVersions } from '../../prompts/prompt-versions';
import { StructuredOutputService } from '../../llm/structured-output';
import type { LlmBudget } from '../../llm/llm-budget';
import { AgentTraceService } from '../../tracing/agent-trace.service';
import type {
  CompanyStyleProfile,
  EvidenceSource,
  InterviewAgentSessionDoc,
  ResearchFindings,
} from '../../types/interview-agent.types';

interface StyleInput {
  sources: EvidenceSource[];
  questions: ResearchFindings['extractedQuestions'];
  degraded: boolean;
}

@Injectable()
export class StyleAnalystService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async analyze(
    session: InterviewAgentSessionDoc,
    params: StyleInput,
    budget?: LlmBudget,
  ): Promise<CompanyStyleProfile> {

    const { system, prompt } = buildStyleAnalystPrompt({
      session,
      sources: params.sources,
      questions: params.questions,
    });
    const output = await this.structured.callStructured<StyleProfileOutput>({
      system,
      prompt,
      schema: styleProfileSchema,
      promptVersion: promptVersions.styleAnalyst,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'style_analyst_llm',
          summary: event.ok
            ? '公司面试风格画像生成完成'
            : `风格分析生成失败（${event.error ?? event.attempt}）`,
          from: 'StyleAnalyst',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    return this.sanitize(output, params);
  }

  /** 结论必须挂在真实来源上：过滤幻觉 sourceId，degraded 时压低置信度 */
  private sanitize(
    output: StyleProfileOutput,
    params: StyleInput,
  ): CompanyStyleProfile {
    const knownSourceIds = new Set(params.sources.map((s) => s.id));
    return {
      ...output,
      frequentTopics: output.frequentTopics.map((topic) => ({
        ...topic,
        sourceIds: topic.sourceIds.filter((id) => knownSourceIds.has(id)),
      })),
      basedOnSourceIds: output.basedOnSourceIds.filter((id) =>
        knownSourceIds.has(id),
      ),
      confidence: params.degraded
        ? Math.min(output.confidence, 0.5)
        : output.confidence,
    };
  }

}
