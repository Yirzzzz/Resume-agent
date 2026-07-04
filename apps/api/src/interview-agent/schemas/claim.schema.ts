import { z } from 'zod';

export const claimSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  status: z.enum([
    'UNVERIFIED',
    'PARTIALLY_VERIFIED',
    'VERIFIED',
    'CONTRADICTED',
  ]),
  sourceTurnIds: z.array(z.string()),
  relatedProjectId: z.string().optional(),
  relatedCompetencyIds: z.array(z.string()),
  importance: z.number().min(1).max(5),
});

export const claimListSchema = z.array(claimSchema);

export type ClaimOutput = z.infer<typeof claimSchema>;
