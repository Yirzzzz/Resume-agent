import { z } from 'zod';

export const policyChoiceSchema = z.object({
  action: z.enum([
    'ASK_MAIN',
    'FOLLOW_UP',
    'CHALLENGE',
    'CLARIFY_CONTRADICTION',
    'SWITCH_TOPIC',
    'SUMMARIZE',
    'END_INTERVIEW',
  ]),
  strategy: z
    .enum([
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
    ])
    .optional(),
  targetClaimId: z.string().optional(),
  targetCompetencyId: z.string().optional(),
  reason: z.string().min(1),
});

export type PolicyChoiceOutput = z.infer<typeof policyChoiceSchema>;
