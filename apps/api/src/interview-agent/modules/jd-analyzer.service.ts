import { Injectable } from '@nestjs/common';
import { JdParserService } from '../../interview-search/jd-parser.service';
import type { InterviewSearchInput } from '../../interview-search/types/interview-search.types';
import { jdAnalysisSchema } from '../schemas/jd-analysis.schema';
import type {
  InterviewAgentSessionDoc,
  JdCompetencyMatrix,
} from '../types/interview-agent.types';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import { promptVersions } from '../prompts/prompt-versions';
import { AgentTraceService } from '../tracing/agent-trace.service';

@Injectable()
export class JdAnalyzerService {
  constructor(
    private readonly jdParser: JdParserService,
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async analyze(
    session: InterviewAgentSessionDoc,
    budget?: LlmBudget,
  ): Promise<JdCompetencyMatrix> {
    const input: InterviewSearchInput = {
      company: session.input.company,
      position: session.input.position,
      jd: session.input.jobDescription,
      searchDepth: 'quick',
    };
    const profile = await this.jdParser.parse(input);

    const matrix = await this.structured.callStructured<JdCompetencyMatrix>({
      system: '你是JD能力矩阵分析器，只输出合法JSON。',
      prompt: JSON.stringify(
        {
          task: '将JD拆成可面试验证的能力矩阵。importance 1-5，questionRatio 总和约为1。',
          company: session.input.company,
          position: session.input.position,
          jobDescription: session.input.jobDescription,
          fallbackKeywords: profile.technicalKeywords,
          outputShape: {
            competencies: [
              {
                id: 'comp_core_1',
                name: '能力名称',
                category: 'core',
                importance: 5,
                questionRatio: 0.3,
                evidenceKeywords: ['关键词'],
              },
            ],
          },
        },
        null,
        2,
      ),
      schema: jdAnalysisSchema,
      promptVersion: promptVersions.jdAnalyzer,
      budget,
      onTrace: (event) => {
        this.trace.push(session, {
          step: 'jd_analyzer_llm',
          summary: event.ok
            ? 'JD能力矩阵LLM解析成功'
            : `JD能力矩阵生成失败（${event.error ?? event.attempt}）`,
          from: 'JdAnalyzer',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        });
      },
    });

    this.trace.push(session, {
      step: 'jd_analyzed',
      summary: `生成 ${matrix.competencies.length} 个JD能力点`,
      inputSummary: {
        roleType: profile.roleType,
        keywords: profile.technicalKeywords.slice(0, 8),
      },
      promptVersion: promptVersions.jdAnalyzer,
    });
    return matrix;
  }

}
