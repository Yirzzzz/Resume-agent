import {
  InterviewReport,
  JdProfile,
  SearchQuery,
  SearchResult,
  AgentTraceEvent,
  RankedQuestion,
  QuestionCluster,
  ExtractedQuestion,
  InterviewSearchInput,
  DeepInterviewResult,
} from '../types/interview-search.types';

export class InterviewSearchResultDto {
  taskId = '';

  input!: InterviewSearchInput;

  jdProfile!: JdProfile;

  trace: AgentTraceEvent[] = [];

  queries: SearchQuery[] = [];

  sources: SearchResult[] = [];

  questions: ExtractedQuestion[] = [];

  clusters: QuestionCluster[] = [];

  rankedQuestions: RankedQuestion[] = [];

  deepInterview!: DeepInterviewResult;

  report!: InterviewReport;
}
