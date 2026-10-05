import { z } from 'zod';

/**
 * Validation schema for adding a comment (Requirement 5.1-5.5).
 */
export const addCommentSchema = z.object({
  body: z
    .string({ required_error: 'Comment body is required' })
    .min(1, 'Comment body must not be empty')
    .max(2000, 'Comment body must not exceed 2000 characters')
    .refine((val) => val.trim().length > 0, {
      message: 'Comment body must not be empty or whitespace',
    }),

  is_internal: z.boolean().optional().default(false),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;
