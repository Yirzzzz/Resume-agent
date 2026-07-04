import { z } from 'zod';

export const interviewPlanSchema = z.object({
  competencyPriorities: z.array(
    z.object({
      competencyId: z.string(),
      priority: z.number(),
      targetQuestionCount: z.number(),
    }),
  ),
  focusProjects: z.array(z.string()),
  highRiskClaims: z.array(z.string()),
  mainQuestionPool: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      competencyIds: z.array(z.string()),
      targetProjectId: z.string().optional(),
      targetClaimIds: z.array(z.string()),
      objective: z.string(),
      followUpDirections: z.array(
        z.enum([
          'EVIDENCE',
          'IMPLEMENTATION',
          'RATIONALE',
          'CONTROL',
          'OWNERSHIP',
          'FAILURE',
          'COUNTERFACTUAL',
          'GENERALIZATION',
          'CONTRADICTION',
          'DIFFICULTY',
        ]),
      ),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      rubric: z.array(
        z.object({
          level: z.enum(['excellent', 'good', 'weak']),
          signal: z.string(),
        }),
      ),
      styleEvidence: z.array(z.string()),
    }),
  ),
  difficultyDistribution: z.object({
    easy: z.number(),
    medium: z.number(),
    hard: z.number(),
  }),
  stopConditions: z.object({
    maxQuestions: z.number(),
    maxFollowUpPerQuestion: z.number(),
    coverageThreshold: z.number(),
  }),
});

export type InterviewPlanOutput = z.infer<typeof interviewPlanSchema>;
