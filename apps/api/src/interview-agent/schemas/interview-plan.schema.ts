import { z } from 'zod';

const nullableStringToUndefined = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional(),
);

const nullableStringArrayToEmpty = z.preprocess(
  (value) => (value === null ? [] : value),
  z.array(z.string()),
);

export const interviewPlanSchema = z.object({
  competencyPriorities: z.array(
    z.object({
      competencyId: z.string(),
      priority: z.number(),
      targetQuestionCount: z.number(),
    }),
  ),
  focusProjects: nullableStringArrayToEmpty,
  highRiskClaims: nullableStringArrayToEmpty,
  mainQuestionPool: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      competencyIds: z.array(z.string()),
      targetProjectId: nullableStringToUndefined,
      targetClaimIds: nullableStringArrayToEmpty,
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
      styleEvidence: nullableStringArrayToEmpty,
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
