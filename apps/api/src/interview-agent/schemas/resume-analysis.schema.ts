import { z } from 'zod';

export const resumeAnalysisSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.string(),
      techStack: z.array(z.string()),
      quantifiedResults: z.array(z.string()),
      keyDecisions: z.array(z.string()),
      jdRelevance: z.enum(['high', 'medium', 'low', 'none']),
    }),
  ),
  attackSurface: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string(),
      description: z.string(),
      kind: z.enum([
        'missing_baseline',
        'unclear_ownership',
        'vague_method',
        'stack_mismatch',
        'metric_without_setup',
        'reproduction_only',
        'confounded_result',
      ]),
      suggestedProbe: z.string(),
    }),
  ),
  claimsToVerify: z.array(
    z.object({
      id: z.string().min(1),
      content: z.string(),
      projectId: z.string(),
      importance: z.number().min(1).max(5),
    }),
  ),
});

export type ResumeAnalysisOutput = z.infer<typeof resumeAnalysisSchema>;
