import { z } from 'zod';

export const jdAnalysisSchema = z.object({
  competencies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        category: z.enum([
          'core',
          'fundamental',
          'engineering',
          'research',
          'system_design',
          'bonus',
          'implicit',
        ]),
        importance: z.number().min(1).max(5),
        questionRatio: z.number().min(0).max(1),
        evidenceKeywords: z.array(z.string()),
      }),
    )
    .min(1),
});

export type JdAnalysisOutput = z.infer<typeof jdAnalysisSchema>;
