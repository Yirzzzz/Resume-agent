import { z } from 'zod';

export const longTermExtractionSchema = z.object({
  entries: z
    .array(
      z.object({
        kind: z.enum([
          'recurring_weakness',
          'improvement',
          'trained_project',
          'training_focus',
        ]),
        conclusion: z.string().min(6).max(200),
      }),
    )
    .max(6),
});

export type LongTermExtractionOutput = z.infer<typeof longTermExtractionSchema>;
