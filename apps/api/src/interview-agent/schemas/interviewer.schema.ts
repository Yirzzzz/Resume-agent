import { z } from 'zod';

/** 面试官产出：自然衔接 + 下一问。下一问必须引用候选人回答中的具体表述。 */
export const interviewerTurnSchema = z.object({
  acknowledgement: z.string().min(1).max(200),
  nextQuestion: z.string().min(8),
  quotedFromAnswer: z
    .string()
    .describe('从候选人回答中引用的原文片段，用于确保追问锚定在回答上')
    .optional(),
});

export type InterviewerTurnOutput = z.infer<typeof interviewerTurnSchema>;

export const openingSchema = z.object({
  opening: z.string().min(8).max(400),
});
