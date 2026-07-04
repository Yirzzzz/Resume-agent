import { z } from 'zod';

/**
 * LLM 从回答中抽取的 Claim 候选。id/状态机由代码侧生成与维护，
 * LLM 只负责语义抽取与重要性判断。
 */
export const claimExtractionSchema = z.object({
  claims: z
    .array(
      z.object({
        content: z.string().min(6),
        kind: z.enum([
          'ownership',
          'metric',
          'decision',
          'implementation',
          'experience',
          'other',
        ]),
        importance: z.coerce.number().min(1).max(5),
        matchesExistingClaimId: z
          .string()
          .describe('若与已有 Claim 是同一断言，填其 id；否则留空')
          .optional(),
      }),
    )
    .max(6),
});

export type ClaimExtractionOutput = z.infer<typeof claimExtractionSchema>;
