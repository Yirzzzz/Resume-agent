import { z } from 'zod';

const score = z.coerce.number().min(1).max(5);

export const judgeSchema = z.object({
  scores: z.object({
    technicalAccuracy: score,
    depth: score,
    implementationDetail: score,
    evidenceSufficiency: score,
    experimentRigor: score,
    rationality: score,
    jdRelevance: score,
    logic: score,
    ownershipClarity: score,
  }),
  informationGain: z.enum(['high', 'medium', 'low']),
  evidenceGaps: z.array(
    z.object({
      claimId: z.string(),
      missing: z.string().min(1),
    }),
  ),
  contradictions: z.array(
    z.object({
      claimId: z.string(),
      conflictsWith: z.string(),
      description: z.string().min(1),
    }),
  ),
  // 边界故意放宽：模型给出的越界幅度在 sanitize 里钳制，不因可修复的值浪费重试
  competencyUpdates: z.array(
    z.object({
      competencyId: z.string().min(1),
      scoreDelta: z.coerce.number().min(-5).max(5),
      confidenceDelta: z.coerce.number().min(-1).max(1),
    }),
  ),
  reasoning: z.string().min(1),
});

export type JudgeOutput = z.infer<typeof judgeSchema>;
