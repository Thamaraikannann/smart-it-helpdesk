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

export const IncidentStatus = {
  Open: 'Open',
  In_Progress: 'In_Progress',
  On_Hold: 'On_Hold',
  Resolved: 'Resolved',
  Closed: 'Closed',
} as const;

export type IncidentCategoryType = (typeof IncidentCategory)[keyof typeof IncidentCategory];
export type IncidentPriorityType = (typeof IncidentPriority)[keyof typeof IncidentPriority];
export type IncidentStatusType = (typeof IncidentStatus)[keyof typeof IncidentStatus];

/**
 * Allowed status transitions (Requirement 7.4).
 * Key: current status → Value: set of valid next statuses
 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Open: ['In_Progress', 'On_Hold'],
  In_Progress: ['On_Hold', 'Resolved'],
  On_Hold: ['In_Progress'],
  Resolved: ['Closed'],
  Closed: [],
};

/**
 * Priority ordering for sort (Low < Medium < High < Critical).
 * Used to produce a deterministic DB sort via CASE expression.
 */
export const PRIORITY_ORDER: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

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
    errorMap: (issue) => ({
      message:
        issue.code === 'invalid_enum_value'
          ? `Category must be one of: ${Object.values(IncidentCategory).join(', ')}`
          : 'Category is required',
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
    errorMap: (issue) => ({
      message:
        issue.code === 'invalid_enum_value'
          ? `Priority must be one of: ${Object.values(IncidentPriority).join(', ')}`
          : 'Priority is required',
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

// ── Valid sort fields ────────────────────────────────────────────────────────

export const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'priority'] as const;
export type SortField = (typeof VALID_SORT_FIELDS)[number];

// ── List / search query schema ───────────────────────────────────────────────

export const listIncidentsQuerySchema = z.object({
  search: z.string().optional(),

  status: z
    .enum(
      [
        IncidentStatus.Open,
        IncidentStatus.In_Progress,
        IncidentStatus.On_Hold,
        IncidentStatus.Resolved,
        IncidentStatus.Closed,
      ],
      {
        errorMap: () => ({
          message: `Status must be one of: ${Object.values(IncidentStatus).join(', ')}`,
        }),
      },
    )
    .optional(),

  category: z
    .enum(
      [
        IncidentCategory.Hardware,
        IncidentCategory.Software,
        IncidentCategory.Network,
        IncidentCategory.Access_Permissions,
        IncidentCategory.Email_Communication,
        IncidentCategory.Other,
      ],
      {
        errorMap: () => ({
          message: `Category must be one of: ${Object.values(IncidentCategory).join(', ')}`,
        }),
      },
    )
    .optional(),

  priority: z
    .enum(
      [
        IncidentPriority.Low,
        IncidentPriority.Medium,
        IncidentPriority.High,
        IncidentPriority.Critical,
      ],
      {
        errorMap: () => ({
          message: `Priority must be one of: ${Object.values(IncidentPriority).join(', ')}`,
        }),
      },
    )
    .optional(),

  // Support_Agent / Admin only
  assigned_to: z.string().uuid('assigned_to must be a valid UUID').optional(),
  submitter_id: z.string().uuid('submitter_id must be a valid UUID').optional(),

  sort_by: z
    .enum(VALID_SORT_FIELDS, {
      errorMap: () => ({
        message: `sort_by must be one of: ${VALID_SORT_FIELDS.join(', ')}`,
      }),
    })
    .default('created_at'),

  sort_order: z
    .enum(['asc', 'desc'], {
      errorMap: () => ({ message: 'sort_order must be asc or desc' }),
    })
    .default('desc'),

  page: z.coerce
    .number({ invalid_type_error: 'page must be a number' })
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .default(1),

  page_size: z.coerce
    .number({ invalid_type_error: 'page_size must be a number' })
    .int('page_size must be an integer')
    .min(1, 'page_size must be at least 1')
    .max(100, 'page_size must not exceed 100')
    .default(20),
});

export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;

// ── Update incident schema ───────────────────────────────────────────────────

export const updateIncidentSchema = z
  .object({
    status: z
      .enum(
        [
          IncidentStatus.Open,
          IncidentStatus.In_Progress,
          IncidentStatus.On_Hold,
          IncidentStatus.Resolved,
          IncidentStatus.Closed,
        ],
        {
          errorMap: () => ({
            message: `Status must be one of: ${Object.values(IncidentStatus).join(', ')}`,
          }),
        },
      )
      .optional(),

    priority: z
      .enum(
        [
          IncidentPriority.Low,
          IncidentPriority.Medium,
          IncidentPriority.High,
          IncidentPriority.Critical,
        ],
        {
          errorMap: () => ({
            message: `Priority must be one of: ${Object.values(IncidentPriority).join(', ')}`,
          }),
        },
      )
      .optional(),

    assigned_to: z
      .string()
      .uuid('assigned_to must be a valid UUID')
      .nullable()
      .optional(),

    resolution_detail: z
      .object({
        root_cause: z.string().min(1, 'root_cause is required'),
        resolution_steps: z.string().min(1, 'resolution_steps is required'),
        resolved_at: z
          .string()
          .datetime({ message: 'resolved_at must be a valid ISO 8601 datetime' }),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
