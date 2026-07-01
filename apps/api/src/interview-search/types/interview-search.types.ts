export type SearchDepth = 'quick' | 'standard' | 'deep';

export type SearchPlatform =
  | 'general'
  | 'nowcoder'
  | 'zhihu'
  | 'xiaohongshu'
  | 'csdn'
  | 'github'
  | 'blog';

export type SearchStrategy =
  | 'company_exact'
  | 'role_general'
  | 'tech_topic'
  | 'platform_specific'
  | 'refinement';

export interface SearchQuery {
  query: string;
  intent: string;
  priority: number;
  platform?: SearchPlatform;
}

export interface SearchRound {
  round: number;
  strategy: SearchStrategy;
  queries: SearchQuery[];
  reason: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  query: string;
  sourceDomain: string;
  rank: number;
}

export interface ReadPage {
  url: string;
  title: string;
  content: string;
  sourceDomain: string;
  readable: boolean;
  contentLength: number;
}

export interface ExtractedQuestion {
  question: string;
  normalizedQuestion: string;
  type: 'technical' | 'project' | 'algorithm' | 'hr' | 'system_design' | 'unknown';
  topic: string;
  evidence: string;
  sourceUrl: string;
  confidence: number;
  jdKeywordsMatched: string[];
}

export interface CoverageResult {
  enough: boolean;
  round: number;
  questionCount: number;
  companySpecificSourceCount: number;
  keywordCoverageRatio: number;
  coveredKeywords: string[];
  missingKeywords: string[];
  missingQuestionTypes: string[];
  reason: string;
  nextQueries: SearchQuery[];
}

export interface QuestionCluster {
  id: string;
  representativeQuestion: string;
  questions: ExtractedQuestion[];
  topic: string;
  frequency: number;
  sourceUrls: string[];
}

export interface RankedQuestion {
  question: string;
  type: string;
  topic: string;
  score: number;
  reason: string;
  frequency: number;
  sourceUrls: string[];
  evidences: string[];
  expectedPoints: string[];
}

export interface DeepInterviewQuestion {
  question: string;
  focus: string;
  whyAsk: string;
  followUp: string;
  expectedAnswer: string;
  expectedPoints: string[];
  sourceUrls: string[];
  evidences: string[];
  origin: 'search' | 'synthesis';
}

export interface DeepInterviewResult {
  opening: string;
  strategy: string;
  questions: DeepInterviewQuestion[];
}

export interface InterviewReport {
  summary: string;
  jdKeywords: string[];
  experienceDigests: {
    platform: string;
    summary: string;
    sourceUrls: string[];
    evidences: string[];
  }[];
  practiceSet: RankedQuestion[];
  topQuestions: RankedQuestion[];
  jdRelatedQuestions: RankedQuestion[];
  projectFollowupQuestions: RankedQuestion[];
  reviewPlan: {
    topic: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
    suggestedPreparation: string[];
  }[];
  sourceSummary: {
    totalSources: number;
    readableSources: number;
    sourceDomains: string[];
  };
}

export interface AgentTraceEvent {
  step: string;
  round?: number;
  message: string;
  data?: unknown;
  createdAt: string;
}

export interface JdProfile {
  roleType: string;
  responsibilities: string[];
  requiredSkills: string[];
  technicalKeywords: string[];
  companyAliases: string[];
  roleAliases: string[];
}

export interface InterviewSearchInput {
  company: string;
  position: string;
  jd: string;
  resume?: string;
  searchDepth: SearchDepth;
}

export interface InterviewSearchState {
  taskId: string;
  input: InterviewSearchInput;
  jdProfile: JdProfile;
  searchRounds: SearchRound[];
  searchResults: SearchResult[];
  pages: ReadPage[];
  extractedQuestions: ExtractedQuestion[];
  clusters: QuestionCluster[];
  coverage: CoverageResult;
  rankedQuestions: RankedQuestion[];
  deepInterview: DeepInterviewResult;
  report: InterviewReport;
  trace: AgentTraceEvent[];
}
