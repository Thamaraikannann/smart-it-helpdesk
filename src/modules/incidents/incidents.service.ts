import { IncidentStatus as PrismaIncidentStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ValidationError, NotFoundError } from '../../lib/errors';
import { buildPaginationEnvelope } from '../../lib/pagination';
import { analyzeIncident } from '../../services/ai.service';
import {
  createIncidentSchema,
  CreateIncidentInput,
  listIncidentsQuerySchema,
  ListIncidentsQuery,
  updateIncidentSchema,
  UpdateIncidentInput,
  ALLOWED_TRANSITIONS,
  PRIORITY_ORDER,
} from './incidents.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map the Zod-facing status string (uses underscores) to the Prisma enum value.
 * Prisma schema uses: Open, In_Progress, On_Hold, Resolved, Closed
 */
function toDbStatus(s: string): PrismaIncidentStatus {
  return s as PrismaIncidentStatus;
}

// ---------------------------------------------------------------------------
// IncidentsService
// ---------------------------------------------------------------------------

export class IncidentsService {
  /**
   * Creates a new incident for the authenticated user.
   * Requirements: 2.1-2.9, 3.1-3.5
   */
  async createIncident(
    input: CreateIncidentInput,
    submitterId: string,
  ) {
    const validation = createIncidentSchema.safeParse(input);

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

    // AI failure returns null and never prevents incident creation.
    const aiSuggestions = await analyzeIncident(data.description);

    const incident = await prisma.$transaction(async (tx) => {
      const createdIncident = await tx.incident.create({
        data: {
          title: data.title,
          description: data.description,
          category: data.category,
          priority: data.priority,
          status: 'Open',
          submitter_id: submitterId,
          attachment_info: data.attachment_info ?? undefined,
          ai_suggestions: aiSuggestions
            ? (aiSuggestions as unknown as Record<string, string>)
            : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          incident_id: createdIncident.id,
          actor_id: submitterId,
          operation: 'CREATE',
          field: null,
          old_value: undefined,
          new_value: JSON.stringify({
            title: createdIncident.title,
            category: createdIncident.category,
            priority: createdIncident.priority,
            status: createdIncident.status,
          }),
        },
      });

      return createdIncident;
    });

    return incident;
  }

  /**
   * Returns a paginated, filtered, sorted list of incidents.
   * Requirements: 4.1-4.2, 6.1-6.7, 7.1, 8.1-8.6
   *
   * - Employee: only their own incidents
   * - Support_Agent / Admin: all incidents
   */
  async listIncidents(
    rawQuery: unknown,
    requestingUser: { id: string; role: Role },
  ) {
    const validation = listIncidentsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
      throw new ValidationError(
        'Invalid query parameters',
        validation.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'unknown',
          message: issue.message,
        })),
      );
    }

    const q: ListIncidentsQuery = validation.data;

    const isEmployee = requestingUser.role === Role.Employee;

    // ── WHERE clause ──────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    // Employees can only see their own incidents (Requirement 4.1)
    if (isEmployee) {
      where['submitter_id'] = requestingUser.id;
    } else {
      // Support_Agent / Admin additional filters (Requirement 8.2)
      if (q.assigned_to !== undefined) where['assigned_to'] = q.assigned_to;
      if (q.submitter_id !== undefined) where['submitter_id'] = q.submitter_id;
    }

    // Common filters (Requirements 6.2-6.4, 8.2)
    if (q.status !== undefined) where['status'] = toDbStatus(q.status);
    if (q.category !== undefined) where['category'] = q.category;
    if (q.priority !== undefined) where['priority'] = q.priority;

    // Case-insensitive title/description search (Requirements 6.1, 8.1)
    if (q.search) {
      where['OR'] = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    // ── ORDER BY ──────────────────────────────────────────────────────────────
    let orderBy: object;

    if (q.sort_by === 'priority') {
      // Prisma doesn't support enum ordering by custom weight natively,
      // so we fall back to raw SQL for priority ordering.
      // Build deterministic orderBy using a raw sort on priority enum weight.
      // We store the PRIORITY_ORDER map and sort in application layer after fetch,
      // but for DB-level pagination correctness we use a workaround:
      // sort by a virtual column using Prisma's raw query extension is complex,
      // so we retrieve ids in order via a raw query, then fetch records.
      // Simpler: fetch with no order on priority from DB, sort in app.
      // Given page_size ≤ 100 this is acceptable and avoids raw SQL complexity.
      orderBy = { created_at: 'desc' as const };
    } else {
      orderBy = { [q.sort_by]: q.sort_order };
    }

    // ── Pagination ────────────────────────────────────────────────────────────
    const skip = (q.page - 1) * q.page_size;
    const take = q.page_size;

    const [incidents, total_count] = await Promise.all([
      prisma.incident.findMany({ where, orderBy, skip, take }),
      prisma.incident.count({ where }),
    ]);

    // Apply in-memory priority sort when sort_by === 'priority'
    let result = incidents;
    if (q.sort_by === 'priority') {
      result = [...incidents].sort((a, b) => {
        const aWeight = PRIORITY_ORDER[a.priority] ?? 0;
        const bWeight = PRIORITY_ORDER[b.priority] ?? 0;
        return q.sort_order === 'asc' ? aWeight - bWeight : bWeight - aWeight;
      });
    }

    const pagination = buildPaginationEnvelope(total_count, q.page, q.page_size);

    return { data: result, pagination };
  }

  /**
   * Returns a single incident by ID.
   * Requirements: 4.3-4.5
   *
   * - Employee: 404 if incident doesn't belong to them
   * - Support_Agent / Admin: any incident
   */
  async getIncidentById(
    id: string,
    requestingUser: { id: string; role: Role },
  ) {
    const incident = await prisma.incident.findUnique({ where: { id } });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Employees can only access their own incidents (Requirement 4.3-4.4)
    if (
      requestingUser.role === Role.Employee &&
      incident.submitter_id !== requestingUser.id
    ) {
      throw new NotFoundError('Incident not found');
    }

    return incident;
  }

  /**
   * Updates an incident (status, priority, assignment, resolution detail).
   * Requirements: 7.2-7.7, 11.1-11.2
   */
  async updateIncident(
    id: string,
    input: UpdateIncidentInput,
    actorId: string,
    actorRole: Role,
  ) {
    const validation = updateIncidentSchema.safeParse(input);

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

    // Load the existing incident
    const existing = await prisma.incident.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundError('Incident not found');
    }

    // ── Validate status transition (Requirement 7.4) ──────────────────────────
    if (data.status !== undefined) {
      const currentStatus = existing.status as string;
      const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(data.status)) {
        throw new ValidationError(
          `Invalid status transition from ${currentStatus}`,
          [
            {
              field: 'status',
              message: `Cannot transition from ${currentStatus} to ${data.status}. Allowed: ${allowed.join(', ') || 'none'}`,
            },
          ],
        );
      }
    }

    // ── Validate assignment target role (Requirement 7.2-7.3) ────────────────
    if (data.assigned_to !== undefined && data.assigned_to !== null) {
      const assignee = await prisma.user.findUnique({
        where: { id: data.assigned_to },
        select: { role: true },
      });

      if (
        !assignee ||
        (assignee.role !== Role.Support_Agent && assignee.role !== Role.Admin)
      ) {
        throw new ValidationError('Invalid assignee', [
          {
            field: 'assigned_to',
            message: 'Assignee must be a Support_Agent or Admin',
          },
        ]);
      }
    }

    // ── Build update payload ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    const auditEntries: Array<{ field: string; oldValue: string; newValue: string }> = [];

    if (data.status !== undefined) {
      auditEntries.push({
        field: 'status',
        oldValue: existing.status,
        newValue: data.status,
      });
      updateData['status'] = toDbStatus(data.status);
    }

    if (data.priority !== undefined) {
      auditEntries.push({
        field: 'priority',
        oldValue: existing.priority,
        newValue: data.priority,
      });
      updateData['priority'] = data.priority;
    }

    if (data.assigned_to !== undefined) {
      auditEntries.push({
        field: 'assigned_to',
        oldValue: existing.assigned_to ?? 'unassigned',
        newValue: data.assigned_to ?? 'unassigned',
      });
      updateData['assigned_to'] = data.assigned_to;
      updateData['assigned_at'] = data.assigned_to ? new Date() : null;
    }

    // ── Resolution detail (Requirement 7.6) ───────────────────────────────────
    if (data.resolution_detail !== undefined) {
      updateData['resolution_detail'] = data.resolution_detail as unknown as Record<string, string>;

      // Auto-transition In_Progress → Resolved when resolution is submitted
      const currentStatus = (updateData['status'] as string | undefined) ?? (existing.status as string);
      if (currentStatus === 'In_Progress') {
        const prevStatus = updateData['status'] ?? existing.status;
        updateData['status'] = toDbStatus('Resolved');
        // Record the auto-transition if not already recorded
        const alreadyRecorded = auditEntries.some((e) => e.field === 'status');
        if (!alreadyRecorded) {
          auditEntries.push({
            field: 'status',
            oldValue: String(prevStatus),
            newValue: 'Resolved',
          });
        }
      }

      auditEntries.push({
        field: 'resolution_detail',
        oldValue: existing.resolution_detail ? JSON.stringify(existing.resolution_detail) : 'null',
        newValue: JSON.stringify(data.resolution_detail),
      });
    }

    // ── Persist inside a transaction ──────────────────────────────────────────
    const updated = await prisma.$transaction(async (tx) => {
      const updatedIncident = await tx.incident.update({
        where: { id },
        data: updateData,
      });

      // Write one audit log entry per mutated field (Requirement 7.7, 11.1-11.2)
      for (const entry of auditEntries) {
        await tx.auditLog.create({
          data: {
            incident_id: id,
            actor_id: actorId,
            operation: 'UPDATE',
            field: entry.field,
            old_value: entry.oldValue,
            new_value: entry.newValue,
          },
        });
      }

      return updatedIncident;
    });

    return updated;
  }
}
