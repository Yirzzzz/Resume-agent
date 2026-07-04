import type {
  InterviewMode,
  InterviewRound,
} from '../types/interview-agent.types';

export class CreateSessionDto {
  resumeFileId = '';

  company = '';

  position = '';

  jobDescription = '';

  interviewRound: InterviewRound = 'tech_first';

  mode: InterviewMode = 'realistic';

  maxQuestions = 8;
}
