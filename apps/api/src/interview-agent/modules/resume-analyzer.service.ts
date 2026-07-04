import { Injectable } from '@nestjs/common';
import type { ResumeCustomSectionItem } from '../../resumes/resume.types';
import { resumeAnalysisSchema } from '../schemas/resume-analysis.schema';
import type { ResumeAnalysisOutput } from '../schemas/resume-analysis.schema';
import { buildResumeAnalyzerPrompt } from '../prompts/resume-analyzer.prompt';
import { promptVersions } from '../prompts/prompt-versions';
import { StructuredOutputService } from '../llm/structured-output';
import type { LlmBudget } from '../llm/llm-budget';
import type {
  InterviewAgentSessionDoc,
  ResumeAnalysis,
  SanitizedResume,
} from '../types/interview-agent.types';
import { AgentTraceService } from '../tracing/agent-trace.service';

@Injectable()
export class ResumeAnalyzerService {
  constructor(
    private readonly structured: StructuredOutputService,
    private readonly trace: AgentTraceService,
  ) {}

  async analyze(
    session: InterviewAgentSessionDoc,
    budget?: LlmBudget,
  ): Promise<ResumeAnalysis> {
    const { system, prompt } = buildResumeAnalyzerPrompt({ session });
    const output = await this.structured.callStructured<ResumeAnalysisOutput>({
      system,
      prompt,
      schema: resumeAnalysisSchema,
      promptVersion: promptVersions.resumeAnalyzer,
      budget,
      onTrace: (event) =>
        this.trace.push(session, {
          step: 'resume_analyzer_llm',
          summary: event.ok
            ? '简历深度分析完成（项目/攻击面/待验证Claim）'
            : `简历分析生成失败（${event.error ?? event.attempt}）`,
          from: 'ResumeAnalyzer',
          promptVersion: event.promptVersion,
          tool: 'llm.chat.completions',
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          error: event.error,
        }),
    });

    const analysis = this.sanitize(output);
    this.trace.push(session, {
      step: 'resume_analyzed',
      summary: `抽取 ${analysis.projects.length} 个简历锚点、${analysis.attackSurface.length} 个攻击面、${analysis.claimsToVerify.length} 个待验证Claim，移交研究员与规划师`,
      from: 'ResumeAnalyzer',
      to: 'ExperienceResearcher',
      inputSummary: {
        projectNames: analysis.projects.map((p) => p.name).slice(0, 8),
        attackKinds: analysis.attackSurface.map((a) => a.kind),
      },
    });
    return analysis;
  }

  /** 攻击面/Claim 必须挂在真实存在的项目上，剔除 LLM 幻觉引用 */
  private sanitize(output: ResumeAnalysisOutput): ResumeAnalysis {
    const projectIds = new Set(output.projects.map((p) => p.id));
    return {
      projects: output.projects.slice(0, 12),
      attackSurface: output.attackSurface.filter((row) =>
        projectIds.has(row.projectId),
      ),
      claimsToVerify: output.claimsToVerify.filter((row) =>
        projectIds.has(row.projectId),
      ),
    };
  }

}
