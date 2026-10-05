import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ValidationError, NotFoundError, ConflictError } from '../../lib/errors';
import { addCommentSchema, AddCommentInput } from './comments.schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommentRecord {
  id: string;
  incident_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// CommentsService
// ---------------------------------------------------------------------------

export class CommentsService {
  /**
   * Adds a comment to an incident.
   *
   * Rules (Requirements 5.1-5.6):
   * - body required, max 2000 chars, must not be blank
   * - Employees can comment only on their own incidents
   * - is_internal=true only for Support_Agent / Admin; silently coerced to false
   *   for Employees (they cannot set it at all per requirement 5.2)
   * - Closed incidents reject new comments with HTTP 409 (Requirement 5.6)
   * - No AuditLog entry required by spec for comments (spec 11 only covers Incident mutations)
   */
  async addComment(
    incidentId: string,
    input: AddCommentInput,
    actor: { id: string; role: Role },
  ): Promise<CommentRecord> {
    // ── Validate body ─────────────────────────────────────────────────────────
    const validation = addCommentSchema.safeParse(input);

    if (!validation.success) {
      throw new ValidationError(
        'Request validation failed',
        validation.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'unknown',
          message: issue.message,
        })),
      );
    }

    const data = validation.data;

    // ── Load incident ─────────────────────────────────────────────────────────
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, status: true, submitter_id: true },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // ── Role-based access: Employees can only comment on their own incidents ───
    if (
      actor.role === Role.Employee &&
      incident.submitter_id !== actor.id
    ) {
      throw new NotFoundError('Incident not found');
    }

    // ── Closed incident check (Requirement 5.6) ───────────────────────────────
    if (incident.status === 'Closed') {
      throw new ConflictError('Cannot add a comment to a closed incident');
    }

    // ── Enforce is_internal permissions (Requirement 5.2) ────────────────────
    // Employees may not post internal notes; coerce to false if they somehow
    // send is_internal=true (defence-in-depth; controller also enforces this).
    const isInternal =
      actor.role !== Role.Employee ? data.is_internal : false;

    // ── Persist ───────────────────────────────────────────────────────────────
    const comment = await prisma.comment.create({
      data: {
        incident_id: incidentId,
        author_id: actor.id,
        body: data.body,
        is_internal: isInternal,
      },
    });

    return {
      id: comment.id,
      incident_id: comment.incident_id,
      author_id: comment.author_id,
      body: comment.body,
      is_internal: comment.is_internal,
      created_at: comment.created_at,
    };
  }

  /**
   * Returns comments for an incident in ascending created_at order.
   *
   * Rules (Requirements 4.5, 4.6, 5.3):
   * - Employees: only non-internal comments on their own incidents
   * - Support_Agent / Admin: all comments (including internal)
   */
  async listComments(
    incidentId: string,
    actor: { id: string; role: Role },
  ): Promise<CommentRecord[]> {
    // ── Verify incident exists and actor can access it ─────────────────────────
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, submitter_id: true },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Employees can only see comments on their own incidents (Requirement 4.3)
    if (
      actor.role === Role.Employee &&
      incident.submitter_id !== actor.id
    ) {
      throw new NotFoundError('Incident not found');
    }

    // ── Build where clause ────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { incident_id: incidentId };

    // Employees must not receive internal notes (Requirement 4.6)
    if (actor.role === Role.Employee) {
      where['is_internal'] = false;
    }

    const comments = await prisma.comment.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return comments.map((c) => ({
      id: c.id,
      incident_id: c.incident_id,
      author_id: c.author_id,
      body: c.body,
      is_internal: c.is_internal,
      created_at: c.created_at,
    }));
  }
}
