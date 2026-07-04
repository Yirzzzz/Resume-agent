import { z } from 'zod';

export const styleProfileSchema = z.object({
  questionTypeDistribution: z.record(z.string(), z.number()),
  technicalDepth: z.enum(['shallow', 'medium', 'deep']),
  frequentTopics: z.array(
    z.object({
      topic: z.string(),
      frequency: z.number(),
      sourceIds: z.array(z.string()),
    }),
  ),
  projectProbePatterns: z.array(z.string()),
  focusFlags: z.object({
    engineering: z.boolean(),
    theory: z.boolean(),
    experimentDesign: z.boolean(),
    systemDesign: z.boolean(),
  }),
  pressureStyle: z.enum(['relaxed', 'normal', 'aggressive']),
  roundDifferences: z.array(
    z.object({
      round: z.string(),
      emphasis: z.string(),
    }),
  ),
  basedOnSourceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type StyleProfileOutput = z.infer<typeof styleProfileSchema>;
