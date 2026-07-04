import type { Resume } from '../../resumes/resume.types';

export type InterviewMode = 'gentle' | 'realistic' | 'pressure';

export type InterviewRound =
  | 'tech_first'
  | 'tech_second'
  | 'tech_third'
  | 'manager'
  | 'hr';

export type SessionStatus =
  | 'CREATED'
  | 'PREPARING'
  | 'PREPARE_FAILED'
  | 'READY'
  | 'INTERVIEWING'
  | 'COMPLETED'
  | 'ABORTED';

export type SourceTier =
  | 'TARGET_COMPANY_TARGET_ROLE'
  | 'TARGET_COMPANY_SIMILAR_ROLE'
  | 'SIMILAR_COMPANY_TARGET_ROLE'
  | 'GENERIC_ROLE'
  | 'AGENT_SYNTHESIZED';

export type FollowUpStrategy =
  | 'EVIDENCE'
  | 'IMPLEMENTATION'
  | 'RATIONALE'
  | 'CONTROL'
  | 'OWNERSHIP'
  | 'FAILURE'
  | 'COUNTERFACTUAL'
  | 'GENERALIZATION'
  | 'CONTRADICTION'
  | 'DIFFICULTY';

export type InterviewAction =
  | 'ASK_MAIN'
  | 'FOLLOW_UP'
  | 'CHALLENGE'
  | 'CLARIFY_CONTRADICTION'
  | 'SWITCH_TOPIC'
  | 'SUMMARIZE'
  | 'END_INTERVIEW';

export interface SessionInput {
  resumeFileId: string;
  company: string;
  position: string;
  jobDescription: string;
  interviewRound: InterviewRound;
  mode: InterviewMode;
  maxQuestions: number;
}

export type SanitizedResume = Omit<Resume, 'basics'> & {
  basics: {
    summary?: string;
    extraInfos?: Array<{ label: string; value: string; icon?: string }>;
  };
};

export interface EvidenceSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  tier: SourceTier;
  credibility: number;
}

export interface CompanyStyleProfile {
  questionTypeDistribution: Record<string, number>;
  technicalDepth: 'shallow' | 'medium' | 'deep';
  frequentTopics: Array<{
    topic: string;
    frequency: number;
    sourceIds: string[];
  }>;
  projectProbePatterns: string[];
  focusFlags: {
    engineering: boolean;
    theory: boolean;
    experimentDesign: boolean;
    systemDesign: boolean;
  };
  pressureStyle: 'relaxed' | 'normal' | 'aggressive';
  roundDifferences: Array<{ round: string; emphasis: string }>;
  basedOnSourceIds: string[];
  confidence: number;
}

export interface ResearchFindings {
  sources: EvidenceSource[];
  extractedQuestions: Array<{
    question: string;
    type: string;
    topic: string;
    sourceId: string;
  }>;
  styleProfile: CompanyStyleProfile;
  searchRounds: Array<{
    round: number;
    tier: SourceTier;
    queries: string[];
    hitCount: number;
    decision: string;
  }>;
  degraded: boolean;
}

export interface JdCompetencyMatrix {
  competencies: Array<{
    id: string;
    name: string;
    category:
      | 'core'
      | 'fundamental'
      | 'engineering'
      | 'research'
      | 'system_design'
      | 'bonus'
      | 'implicit';
    importance: number;
    questionRatio: number;
    evidenceKeywords: string[];
  }>;
}

export interface ResumeAnalysis {
  projects: Array<{
    id: string;
    name: string;
    role: string;
    techStack: string[];
    quantifiedResults: string[];
    keyDecisions: string[];
    jdRelevance: 'high' | 'medium' | 'low' | 'none';
  }>;
  attackSurface: Array<{
    id: string;
    projectId: string;
    description: string;
    kind:
      | 'missing_baseline'
      | 'unclear_ownership'
      | 'vague_method'
      | 'stack_mismatch'
      | 'metric_without_setup'
      | 'reproduction_only'
      | 'confounded_result';
    suggestedProbe: string;
  }>;
  claimsToVerify: Array<{
    id: string;
    content: string;
    projectId: string;
    importance: number;
  }>;
}

export interface InterviewPlan {
  competencyPriorities: Array<{
    competencyId: string;
    priority: number;
    targetQuestionCount: number;
  }>;
  focusProjects: string[];
  highRiskClaims: string[];
  mainQuestionPool: MainQuestion[];
  difficultyDistribution: Record<'easy' | 'medium' | 'hard', number>;
  stopConditions: {
    maxQuestions: number;
    maxFollowUpPerQuestion: number;
    coverageThreshold: number;
  };
}

export interface MainQuestion {
  id: string;
  question: string;
  competencyIds: string[];
  targetProjectId?: string;
  targetClaimIds: string[];
  objective: string;
  followUpDirections: FollowUpStrategy[];
  difficulty: 'easy' | 'medium' | 'hard';
  rubric: Array<{ level: 'excellent' | 'good' | 'weak'; signal: string }>;
  styleEvidence: string[];
}

export interface InterviewClaim {
  id: string;
  content: string;
  status:
    | 'UNVERIFIED'
    | 'PARTIALLY_VERIFIED'
    | 'VERIFIED'
    | 'CONTRADICTED';
  sourceTurnIds: string[];
  relatedProjectId?: string;
  relatedCompetencyIds: string[];
  importance: number;
}

export interface InterviewSessionMemory {
  questionCount: number;
  lowInformationStreak: number;
  coveredCompetencyIds: string[];
  currentMainQuestionId?: string;
  followUpDepth: number;
}

export interface CompetencyMemory {
  competencyId: string;
  score: number;
  confidence: number;
  evidenceTurnIds: string[];
}

export interface UnresolvedIssue {
  id: string;
  kind: 'missing_evidence' | 'contradiction' | 'unclear_ownership' | 'low_depth';
  description: string;
  relatedClaimId?: string;
  openedAtTurnId?: string;
  resolvedAtTurnId?: string;
}

export interface JudgeResult {
  scores: Record<
    | 'technicalAccuracy'
    | 'depth'
    | 'implementationDetail'
    | 'evidenceSufficiency'
    | 'experimentRigor'
    | 'rationality'
    | 'jdRelevance'
    | 'logic'
    | 'ownershipClarity',
    number
  >;
  informationGain: 'high' | 'medium' | 'low';
  evidenceGaps: Array<{ claimId: string; missing: string }>;
  contradictions: Array<{
    claimId: string;
    conflictsWith: string;
    description: string;
  }>;
  competencyUpdates: Array<{
    competencyId: string;
    scoreDelta: number;
    confidenceDelta: number;
    evidenceTurnId: string;
  }>;
  reasoning: string;
}

export interface PolicyDecision {
  action: InterviewAction;
  strategy?: FollowUpStrategy;
  targetClaimId?: string;
  targetCompetencyId?: string;
  reason: string;
  ruleTriggered?: string;
}

export interface InterviewTurn {
  turnId: string;
  index: number;
  question: string;
  questionSource: 'plan_pool' | 'dynamic';
  mainQuestionId: string;
  followUpDepth: number;
  answerText?: string;
  answeredAt?: string;
  extractedClaimIds: string[];
  judge?: JudgeResult;
  decision?: PolicyDecision;
}

export interface AgentTraceEvent {
  id: string;
  step: string;
  summary: string;
  /** 模块间通信：消息来自哪个内部 agent 角色（如 AnswerJudge） */
  from?: string;
  /** 模块间通信：消息发给哪个内部 agent 角色（如 NextActionPolicy） */
  to?: string;
  inputSummary?: unknown;
  promptVersion?: string;
  tool?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
  createdAt: string;
}

export interface InterviewReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  evidenceLinks: Array<{ turnId?: string; claimId?: string; note: string }>;
  competencySummary?: Array<{
    competencyId: string;
    name: string;
    score: number;
    confidence: number;
    evidenceTurnIds: string[];
  }>;
  claimSummary?: Array<{
    claimId: string;
    status: InterviewClaim['status'];
    content: string;
    evidenceTurnIds: string[];
    relatedCompetencyIds: string[];
  }>;
  unresolvedIssues?: Array<{
    issueId: string;
    kind: UnresolvedIssue['kind'];
    description: string;
    relatedClaimId?: string;
    openedAtTurnId?: string;
    resolvedAtTurnId?: string;
  }>;
  turnEvidence?: Array<{
    turnId: string;
    question: string;
    answerExcerpt: string;
    action?: InterviewAction;
    informationGain?: JudgeResult['informationGain'];
    claimIds: string[];
  }>;
}

export interface LongTermMemoryEntry {
  id: string;
  resumeFileId: string;
  kind:
    | 'recurring_weakness'
    | 'improvement'
    | 'trained_project'
    | 'training_focus';
  conclusion: string;
  evidenceSessionIds: string[];
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface LongTermMemoryDoc {
  version: 1;
  entries: LongTermMemoryEntry[];
}

export interface InterviewAgentSessionDoc {
  version: 1;
  sessionId: string;
  status: SessionStatus;
  input: SessionInput;
  resumeSnapshot: SanitizedResume;
  research?: ResearchFindings;
  jdMatrix?: JdCompetencyMatrix;
  resumeAnalysis?: ResumeAnalysis;
  plan?: InterviewPlan;
  memory: {
    session: InterviewSessionMemory;
    claims: InterviewClaim[];
    competencies: CompetencyMemory[];
    unresolvedIssues: UnresolvedIssue[];
  };
  turns: InterviewTurn[];
  report?: InterviewReport;
  trace: AgentTraceEvent[];
  usage: {
    llmCalls: number;
    searchCalls: number;
    pageReads: number;
    promptTokens: number;
    completionTokens: number;
    startedAt: string;
    updatedAt: string;
  };
}

export interface AnswerResponse {
  action: InterviewAction;
  acknowledgement: string;
  nextQuestion: string | null;
  progress: {
    questionCount: number;
    maxQuestions: number;
    coveredCompetencies: number;
    totalCompetencies: number;
  };
  sessionStatus: SessionStatus;
}
