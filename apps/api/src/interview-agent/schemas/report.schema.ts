import { z } from 'zod';

export const reportSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  evidenceLinks: z.array(
    z.object({
      turnId: z.string().optional(),
      claimId: z.string().optional(),
      note: z.string(),
    }),
  ),
});

export type ReportOutput = z.infer<typeof reportSchema>;
