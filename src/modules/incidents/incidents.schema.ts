import { z } from 'zod';

// Mirror Prisma enum values — keep in sync with prisma/schema.prisma
export const IncidentCategory = {
  Hardware: 'Hardware',
  Software: 'Software',
  Network: 'Network',
  Access_Permissions: 'Access_Permissions',
  Email_Communication: 'Email_Communication',
  Other: 'Other',
} as const;

export const IncidentPriority = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'Critical',
} as const;

export type IncidentCategoryType = (typeof IncidentCategory)[keyof typeof IncidentCategory];
export type IncidentPriorityType = (typeof IncidentPriority)[keyof typeof IncidentPriority];

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
] as const;

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const createIncidentSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .min(1, 'Title is required')
    .max(200, 'Title must not exceed 200 characters'),

  description: z
    .string({ required_error: 'Description is required' })
    .min(1, 'Description is required')
    .max(5000, 'Description must not exceed 5000 characters'),

  category: z.enum(
    [
      IncidentCategory.Hardware,
      IncidentCategory.Software,
      IncidentCategory.Network,
      IncidentCategory.Access_Permissions,
      IncidentCategory.Email_Communication,
      IncidentCategory.Other,
    ],
    {
      required_error: 'Category is required',
      invalid_type_error: `Category must be one of: ${Object.values(IncidentCategory).join(', ')}`,
      errorMap: () => ({
        message: `Category must be one of: ${Object.values(IncidentCategory).join(', ')}`,
      }),
    },
  ),

  priority: z.enum(
    [
      IncidentPriority.Low,
      IncidentPriority.Medium,
      IncidentPriority.High,
      IncidentPriority.Critical,
    ],
    {
      required_error: 'Priority is required',
      invalid_type_error: `Priority must be one of: ${Object.values(IncidentPriority).join(', ')}`,
      errorMap: () => ({
        message: `Priority must be one of: ${Object.values(IncidentPriority).join(', ')}`,
      }),
    },
  ),

  attachment_info: z
    .object({
      filename: z
        .string()
        .min(1, 'Filename is required')
        .max(255, 'Filename must not exceed 255 characters'),
      size_bytes: z
        .number({ invalid_type_error: 'size_bytes must be a number' })
        .int('size_bytes must be an integer')
        .min(1, 'File size must be greater than 0')
        .max(MAX_ATTACHMENT_SIZE_BYTES, 'File size must not exceed 10 MB'),
      mime_type: z.enum([...ALLOWED_MIME_TYPES] as [string, ...string[]], {
        errorMap: () => ({
          message: `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
        }),
      }),
    })
    .optional(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

/**
 * Converts a ZodError into the API's field-level details array.
 * Each issue maps to { field, message } where field is the dot-joined path.
 */
export function zodToFieldErrors(
  error: z.ZodError,
): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'unknown',
    message: issue.message,
  }));
}
