import {
  createIncidentSchema,
  zodToFieldErrors,
  IncidentCategory,
  IncidentPriority,
} from './incidents.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BASE = {
  title: 'Laptop will not start',
  description: 'The laptop does not power on after pressing the power button.',
  category: IncidentCategory.Hardware,
  priority: IncidentPriority.Medium,
};

function parseResult(input: unknown) {
  return createIncidentSchema.safeParse(input);
}

function errorsFor(field: string, input: unknown): string[] {
  const result = parseResult(input);
  if (result.success) return [];
  return result.error.issues
    .filter((i) => i.path.join('.') === field)
    .map((i) => i.message);
}

// ---------------------------------------------------------------------------
// Valid inputs
// ---------------------------------------------------------------------------

describe('createIncidentSchema — valid inputs', () => {
  it('accepts a complete valid payload without attachment_info', () => {
    const result = parseResult(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it('accepts a complete valid payload with attachment_info', () => {
    const result = parseResult({
      ...VALID_BASE,
      attachment_info: {
        filename: 'screenshot.png',
        size_bytes: 204800, // 200 KB
        mime_type: 'image/png',
      },
    });
    expect(result.success).toBe(true);
  });

  it('attachment_info is optional — omitting it is valid', () => {
    const result = parseResult(VALID_BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachment_info).toBeUndefined();
    }
  });

  it('accepts all valid IncidentCategory values', () => {
    for (const category of Object.values(IncidentCategory)) {
      const result = parseResult({ ...VALID_BASE, category });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid IncidentPriority values', () => {
    for (const priority of Object.values(IncidentPriority)) {
      const result = parseResult({ ...VALID_BASE, priority });
      expect(result.success).toBe(true);
    }
  });

  it('accepts title at exactly 200 characters', () => {
    const result = parseResult({ ...VALID_BASE, title: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('accepts description at exactly 5000 characters', () => {
    const result = parseResult({ ...VALID_BASE, description: 'a'.repeat(5000) });
    expect(result.success).toBe(true);
  });

  it('accepts attachment filename at exactly 255 characters', () => {
    const result = parseResult({
      ...VALID_BASE,
      attachment_info: {
        filename: 'a'.repeat(255),
        size_bytes: 1024,
        mime_type: 'image/jpeg',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts attachment size at exactly 10 MB', () => {
    const result = parseResult({
      ...VALID_BASE,
      attachment_info: {
        filename: 'file.pdf',
        size_bytes: 10 * 1024 * 1024,
        mime_type: 'application/pdf',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts each allowed MIME type', () => {
    const mimes = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain'] as const;
    for (const mime_type of mimes) {
      const result = parseResult({
        ...VALID_BASE,
        attachment_info: { filename: 'f.txt', size_bytes: 100, mime_type },
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// title validation
// ---------------------------------------------------------------------------

describe('createIncidentSchema — title validation', () => {
  it('returns an error on "title" when title is missing', () => {
    const { title: _omit, ...withoutTitle } = VALID_BASE;
    const errors = errorsFor('title', withoutTitle);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "title" when title is an empty string', () => {
    const errors = errorsFor('title', { ...VALID_BASE, title: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "title" when title exceeds 200 characters', () => {
    const errors = errorsFor('title', { ...VALID_BASE, title: 'a'.repeat(201) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/200/);
  });
});

// ---------------------------------------------------------------------------
// description validation
// ---------------------------------------------------------------------------

describe('createIncidentSchema — description validation', () => {
  it('returns an error on "description" when description is missing', () => {
    const { description: _omit, ...withoutDesc } = VALID_BASE;
    const errors = errorsFor('description', withoutDesc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "description" when description is an empty string', () => {
    const errors = errorsFor('description', { ...VALID_BASE, description: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "description" when description exceeds 5000 characters', () => {
    const errors = errorsFor('description', {
      ...VALID_BASE,
      description: 'a'.repeat(5001),
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/5000/);
  });
});

// ---------------------------------------------------------------------------
// category validation
// ---------------------------------------------------------------------------

describe('createIncidentSchema — category validation', () => {
  it('returns an error on "category" for an invalid category value', () => {
    const errors = errorsFor('category', { ...VALID_BASE, category: 'InvalidCat' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "category" when category is missing', () => {
    const { category: _omit, ...withoutCategory } = VALID_BASE;
    const errors = errorsFor('category', withoutCategory);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// priority validation
// ---------------------------------------------------------------------------

describe('createIncidentSchema — priority validation', () => {
  it('returns an error on "priority" for an invalid priority value', () => {
    const errors = errorsFor('priority', { ...VALID_BASE, priority: 'Urgent' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "priority" when priority is missing', () => {
    const { priority: _omit, ...withoutPriority } = VALID_BASE;
    const errors = errorsFor('priority', withoutPriority);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// attachment_info validation
// ---------------------------------------------------------------------------

describe('createIncidentSchema — attachment_info validation', () => {
  const BASE_ATTACHMENT = {
    filename: 'document.pdf',
    size_bytes: 1024,
    mime_type: 'application/pdf',
  };

  it('returns an error on "attachment_info.mime_type" for a disallowed MIME type', () => {
    const errors = errorsFor('attachment_info.mime_type', {
      ...VALID_BASE,
      attachment_info: { ...BASE_ATTACHMENT, mime_type: 'application/zip' },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error on "attachment_info.size_bytes" when size exceeds 10 MB', () => {
    const errors = errorsFor('attachment_info.size_bytes', {
      ...VALID_BASE,
      attachment_info: {
        ...BASE_ATTACHMENT,
        size_bytes: 10 * 1024 * 1024 + 1,
      },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/10 MB/);
  });

  it('returns an error on "attachment_info.filename" when filename exceeds 255 characters', () => {
    const errors = errorsFor('attachment_info.filename', {
      ...VALID_BASE,
      attachment_info: { ...BASE_ATTACHMENT, filename: 'a'.repeat(256) },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/255/);
  });

  it('returns an error on "attachment_info.size_bytes" when size_bytes is zero', () => {
    const errors = errorsFor('attachment_info.size_bytes', {
      ...VALID_BASE,
      attachment_info: { ...BASE_ATTACHMENT, size_bytes: 0 },
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Multiple field errors at once
// ---------------------------------------------------------------------------

describe('createIncidentSchema — multiple field errors', () => {
  it('reports errors for all invalid fields simultaneously', () => {
    const result = parseResult({
      title: '',
      description: '',
      category: 'BAD',
      priority: 'BAD',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join('.'));
      expect(fields).toContain('title');
      expect(fields).toContain('description');
      expect(fields).toContain('category');
      expect(fields).toContain('priority');
    }
  });
});

// ---------------------------------------------------------------------------
// zodToFieldErrors helper
// ---------------------------------------------------------------------------

describe('zodToFieldErrors', () => {
  it('maps ZodError issues to { field, message } pairs', () => {
    const result = createIncidentSchema.safeParse({
      title: 'a'.repeat(201),
      description: '',
      category: 'Bad',
      priority: 'Bad',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = zodToFieldErrors(result.error);
      expect(Array.isArray(fieldErrors)).toBe(true);
      expect(fieldErrors.length).toBeGreaterThan(0);
      for (const fe of fieldErrors) {
        expect(fe).toHaveProperty('field');
        expect(fe).toHaveProperty('message');
        expect(typeof fe.field).toBe('string');
        expect(typeof fe.message).toBe('string');
      }
    }
  });

  it('uses "unknown" for issues with an empty path', () => {
    // Craft a ZodError with an issue that has an empty path
    const { ZodError, ZodIssueCode } = jest.requireActual<typeof import('zod')>('zod');
    const fakeError = new ZodError([
      {
        code: ZodIssueCode.custom,
        path: [],
        message: 'Something went wrong',
      },
    ]);
    const fieldErrors = zodToFieldErrors(fakeError);
    expect(fieldErrors[0].field).toBe('unknown');
    expect(fieldErrors[0].message).toBe('Something went wrong');
  });
});
