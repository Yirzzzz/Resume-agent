import { Module } from '@nestjs/common';
import { InterviewSearchModule } from '../interview-search/interview-search.module';
import { ResumesService } from '../resumes/resumes.service';
import { InterviewAgentController } from './interview-agent.controller';
import { InterviewAgentService } from './interview-agent.service';
import { LlmClientService } from './llm/llm-client.service';
import { StructuredOutputService } from './llm/structured-output';
import { LongTermMemoryService } from './memory/long-term-memory.service';
import { SessionMemoryService } from './memory/session-memory.service';
import { AnswerJudgeService } from './modules/answer-judge.service';
import { ClaimExtractorService } from './modules/claim-extractor.service';
import { InterviewPlannerService } from './modules/interview-planner.service';
import { InterviewerService } from './modules/interviewer.service';
import { JdAnalyzerService } from './modules/jd-analyzer.service';
import { NextActionPolicyService } from './modules/next-action-policy.service';
import { PlanReviewerService } from './modules/plan-reviewer.service';
import { ReportGeneratorService } from './modules/report-generator.service';
import { ResumeAnalyzerService } from './modules/resume-analyzer.service';
import { DeepSearchPlannerService } from './modules/research/deep-search-planner.service';
import { ExperienceResearcherService } from './modules/research/experience-researcher.service';
import { StyleAnalystService } from './modules/research/style-analyst.service';
import { SessionStoreService } from './store/session-store.service';
import { AgentTraceService } from './tracing/agent-trace.service';

@Module({
  imports: [InterviewSearchModule],
  controllers: [InterviewAgentController],
  providers: [
    ResumesService,
    InterviewAgentService,
    LlmClientService,
    StructuredOutputService,
    JdAnalyzerService,
    ResumeAnalyzerService,
    DeepSearchPlannerService,
    ExperienceResearcherService,
    StyleAnalystService,
    InterviewPlannerService,
    PlanReviewerService,
    ClaimExtractorService,
    AnswerJudgeService,
    NextActionPolicyService,
    InterviewerService,
    ReportGeneratorService,
    LongTermMemoryService,
    SessionMemoryService,
    SessionStoreService,
    AgentTraceService,
  ],
})
export class InterviewAgentModule {}
