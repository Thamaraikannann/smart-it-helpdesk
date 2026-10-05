/**
 * Unit tests for CommentsService
 * Requirements: 5.1-5.6, 4.5, 4.6
 *
 * Prisma client is fully mocked — no database connection required.
 */

// ── Env vars (must precede any module importing config.ts) ───────────────────
process.env['JWT_SECRET'] = 'test-secret-for-comments-service-unit-tests-32!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['AI_API_URL'] = 'https://api.openai.com/v1';
process.env['AI_API_KEY'] = 'test-ai-key';
process.env['NODE_ENV'] = 'test';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../lib/prisma', () => ({
  prisma: {
    incident: {
      findUnique: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { CommentsService } from './comments.service';
import { ValidationError, NotFoundError, ConflictError } from '../../lib/errors';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIncident(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'incident-1',
    status: 'Open',
    submitter_id: 'employee-1',
    ...overrides,
  };
}

function makeComment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'comment-1',
    incident_id: 'incident-1',
    author_id: 'employee-1',
    body: 'This is a comment.',
    is_internal: false,
    created_at: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  };
}

const EMPLOYEE = { id: 'employee-1', role: Role.Employee };
const OTHER_EMPLOYEE = { id: 'employee-2', role: Role.Employee };
const AGENT = { id: 'agent-1', role: Role.Support_Agent };
const ADMIN = { id: 'admin-1', role: Role.Admin };

const VALID_INPUT = { body: 'My printer is still broken.', is_internal: false };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let service: CommentsService;

beforeEach(() => {
  service = new CommentsService();
  jest.clearAllMocks();
});

// ===========================================================================
// addComment
// ===========================================================================

describe('CommentsService.addComment', () => {

  // ── Successful creation ───────────────────────────────────────────────────

  it('creates a comment for an Employee on their own incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const created = makeComment();
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(created);

    const result = await service.addComment('incident-1', VALID_INPUT, EMPLOYEE);

    expect(result).toMatchObject({
      id: 'comment-1',
      incident_id: 'incident-1',
      author_id: 'employee-1',
      is_internal: false,
    });
    expect(mockedPrisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incident_id: 'incident-1',
          author_id: 'employee-1',
          body: VALID_INPUT.body,
          is_internal: false,
        }),
      }),
    );
  });

  it('creates a non-internal comment for a Support_Agent', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const created = makeComment({ author_id: 'agent-1', is_internal: false });
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(created);

    const result = await service.addComment(
      'incident-1',
      { body: 'Working on it.', is_internal: false },
      AGENT,
    );

    expect(result.is_internal).toBe(false);
  });

  it('creates an internal note for a Support_Agent', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const created = makeComment({ author_id: 'agent-1', is_internal: true });
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(created);

    const result = await service.addComment(
      'incident-1',
      { body: 'Internal: escalating to tier 2.', is_internal: true },
      AGENT,
    );

    expect(result.is_internal).toBe(true);
    expect(mockedPrisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ is_internal: true }),
      }),
    );
  });

  it('creates an internal note for an Admin', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const created = makeComment({ author_id: 'admin-1', is_internal: true });
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(created);

    const result = await service.addComment(
      'incident-1',
      { body: 'Admin internal note.', is_internal: true },
      ADMIN,
    );

    expect(result.is_internal).toBe(true);
  });

  // ── is_internal coercion for Employee ────────────────────────────────────

  it('coerces is_internal to false when Employee attempts to set it true', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const created = makeComment({ is_internal: false });
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(created);

    await service.addComment(
      'incident-1',
      { body: 'Should not be internal.', is_internal: true },
      EMPLOYEE,
    );

    expect(mockedPrisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ is_internal: false }),
      }),
    );
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('throws ValidationError when body is missing', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );

    await expect(
      service.addComment('incident-1', { body: '' } as never, EMPLOYEE),
    ).rejects.toThrow(ValidationError);

    expect(mockedPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError when body is whitespace-only', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );

    await expect(
      service.addComment('incident-1', { body: '   ' } as never, EMPLOYEE),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when body exceeds 2000 characters', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );

    await expect(
      service.addComment(
        'incident-1',
        { body: 'a'.repeat(2001), is_internal: false },
        EMPLOYEE,
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockedPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('accepts body at exactly 2000 characters', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const created = makeComment({ body: 'a'.repeat(2000) });
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(created);

    const result = await service.addComment(
      'incident-1',
      { body: 'a'.repeat(2000), is_internal: false },
      EMPLOYEE,
    );

    expect(result).toBeDefined();
  });

  // ── Incident not found ────────────────────────────────────────────────────

  it('throws NotFoundError when incident does not exist', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.addComment('nonexistent', VALID_INPUT, EMPLOYEE),
    ).rejects.toThrow(NotFoundError);

    expect(mockedPrisma.comment.create).not.toHaveBeenCalled();
  });

  // ── Employee access control ───────────────────────────────────────────────

  it('throws NotFoundError when Employee comments on another users incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: 'someone-else' }),
    );

    await expect(
      service.addComment('incident-1', VALID_INPUT, EMPLOYEE),
    ).rejects.toThrow(NotFoundError);

    expect(mockedPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('allows Support_Agent to comment on any incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: 'some-employee' }),
    );
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(
      makeComment({ author_id: 'agent-1' }),
    );

    const result = await service.addComment('incident-1', VALID_INPUT, AGENT);

    expect(result).toBeDefined();
  });

  // ── Closed incident rejection (Requirement 5.6) ──────────────────────────

  it('throws ConflictError (HTTP 409) when incident is Closed', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ status: 'Closed' }),
    );

    await expect(
      service.addComment('incident-1', VALID_INPUT, EMPLOYEE),
    ).rejects.toThrow(ConflictError);

    expect(mockedPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('ConflictError has status code 409', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ status: 'Closed' }),
    );

    const err = await service
      .addComment('incident-1', VALID_INPUT, EMPLOYEE)
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.statusCode).toBe(409);
  });

  it('allows comments on Resolved incidents (not yet Closed)', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ status: 'Resolved' }),
    );
    (mockedPrisma.comment.create as jest.Mock).mockResolvedValue(makeComment());

    const result = await service.addComment('incident-1', VALID_INPUT, EMPLOYEE);

    expect(result).toBeDefined();
  });

  it('Support_Agent also cannot comment on a Closed incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ status: 'Closed', submitter_id: 'other' }),
    );

    await expect(
      service.addComment('incident-1', VALID_INPUT, AGENT),
    ).rejects.toThrow(ConflictError);
  });
});

// ===========================================================================
// listComments
// ===========================================================================

describe('CommentsService.listComments', () => {

  // ── Employee: own incident, no internal comments ──────────────────────────

  it('returns non-internal comments for Employee on their own incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: EMPLOYEE.id }),
    );
    const comments = [
      makeComment({ id: 'c1', is_internal: false }),
      makeComment({ id: 'c2', is_internal: false }),
    ];
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue(comments);

    const result = await service.listComments('incident-1', EMPLOYEE);

    expect(result).toHaveLength(2);
    // Verify is_internal: false filter was passed
    const findManyCall = (mockedPrisma.comment.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.is_internal).toBe(false);
  });

  it('filters out internal comments for Employees at DB level', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: EMPLOYEE.id }),
    );
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue([]);

    await service.listComments('incident-1', EMPLOYEE);

    const call = (mockedPrisma.comment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.is_internal).toBe(false);
  });

  // ── Support_Agent: all comments including internal ────────────────────────

  it('returns all comments including internal for Support_Agent', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    const comments = [
      makeComment({ id: 'c1', is_internal: false }),
      makeComment({ id: 'c2', is_internal: true }),
    ];
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue(comments);

    const result = await service.listComments('incident-1', AGENT);

    expect(result).toHaveLength(2);
    // Verify no is_internal filter
    const call = (mockedPrisma.comment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.is_internal).toBeUndefined();
  });

  it('returns all comments including internal for Admin', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue([
      makeComment({ is_internal: true }),
    ]);

    const result = await service.listComments('incident-1', ADMIN);

    expect(result[0]!.is_internal).toBe(true);
  });

  // ── Ascending created_at order ────────────────────────────────────────────

  it('orders comments by created_at ascending', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident(),
    );
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue([]);

    await service.listComments('incident-1', AGENT);

    const call = (mockedPrisma.comment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.orderBy).toEqual({ created_at: 'asc' });
  });

  // ── Incident access control ───────────────────────────────────────────────

  it('throws NotFoundError when incident does not exist', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.listComments('nonexistent', AGENT),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when Employee lists comments on another users incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: OTHER_EMPLOYEE.id }),
    );

    await expect(
      service.listComments('incident-1', EMPLOYEE),
    ).rejects.toThrow(NotFoundError);

    expect(mockedPrisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('allows Support_Agent to list comments on any incident', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: 'some-employee' }),
    );
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.listComments('incident-1', AGENT);

    expect(Array.isArray(result)).toBe(true);
  });

  // ── Empty list ────────────────────────────────────────────────────────────

  it('returns an empty array when there are no comments', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: EMPLOYEE.id }),
    );
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.listComments('incident-1', EMPLOYEE);

    expect(result).toEqual([]);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it('returns correctly shaped CommentRecord objects', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(
      makeIncident({ submitter_id: EMPLOYEE.id }),
    );
    const raw = makeComment();
    (mockedPrisma.comment.findMany as jest.Mock).mockResolvedValue([raw]);

    const result = await service.listComments('incident-1', EMPLOYEE);

    expect(result[0]).toEqual({
      id: raw.id,
      incident_id: raw.incident_id,
      author_id: raw.author_id,
      body: raw.body,
      is_internal: raw.is_internal,
      created_at: raw.created_at,
    });
  });
});
