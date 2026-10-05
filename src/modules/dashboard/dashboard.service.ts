import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface StatusCount {
  status: string;
  count: number;
}

export interface PriorityCount {
  priority: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface DashboardMetrics {
  /** Total number of incidents across all statuses */
  total_incidents: number;

  /** Count per IncidentStatus value */
  by_status: StatusCount[];

  /** Count per IncidentPriority value */
  by_priority: PriorityCount[];

  /** Count per IncidentCategory value */
  by_category: CategoryCount[];

  /** Open incidents with no assignee (Requirement 9.4) */
  unassigned_open_count: number;

  /**
   * Average seconds from incident creation to first In_Progress transition,
   * over incidents created in the past 30 days that have reached In_Progress.
   * Incidents still in Open status are excluded (Requirement 9.5).
   * null when there are no qualifying incidents.
   */
  avg_seconds_to_in_progress: number | null;
}

// ---------------------------------------------------------------------------
// DashboardService
// ---------------------------------------------------------------------------

export class DashboardService {
  /**
   * Computes all dashboard metrics at query time (Requirement 9.6).
   *
   * Accessible by Support_Agent and Admin (access control enforced in router).
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // Run all independent queries in parallel for efficiency.
    const [
      byStatusRaw,
      byPriorityRaw,
      byCategoryRaw,
      unassignedOpenCount,
      avgSecondsRaw,
    ] = await Promise.all([
      // ── Counts by status (Requirement 9.1) ──────────────────────────────────
      prisma.incident.groupBy({
        by: ['status'],
        _count: { id: true },
      }),

      // ── Counts by priority (Requirement 9.2) ────────────────────────────────
      prisma.incident.groupBy({
        by: ['priority'],
        _count: { id: true },
      }),

      // ── Counts by category (Requirement 9.3) ────────────────────────────────
      prisma.incident.groupBy({
        by: ['category'],
        _count: { id: true },
      }),

      // ── Unassigned open incidents (Requirement 9.4) ──────────────────────────
      prisma.incident.count({
        where: {
          status: 'Open',
          assigned_to: null,
        },
      }),

      // ── Average time to In_Progress (Requirement 9.5) ───────────────────────
      // Fetches audit log entries for CREATE and the first UPDATE that set
      // status to In_Progress, for incidents created in the past 30 days.
      // We compute the average in application code to avoid raw SQL.
      this.computeAvgSecondsToInProgress(),
    ]);

    // ── Shape groupBy results ────────────────────────────────────────────────

    const by_status: StatusCount[] = byStatusRaw.map((row) => ({
      status: row.status,
      count: row._count.id,
    }));

    const by_priority: PriorityCount[] = byPriorityRaw.map((row) => ({
      priority: row.priority,
      count: row._count.id,
    }));

    const by_category: CategoryCount[] = byCategoryRaw.map((row) => ({
      category: row.category,
      count: row._count.id,
    }));

    return {
      total_incidents: by_status.reduce((sum, s) => sum + s.count, 0),
      by_status,
      by_priority,
      by_category,
      unassigned_open_count: unassignedOpenCount,
      avg_seconds_to_in_progress: avgSecondsRaw,
    };
  }

  /**
   * Computes the average time in seconds from incident creation to the first
   * status transition to In_Progress, for incidents created in the past 30 days
   * that have at least one such transition.
   *
   * Returns null when no qualifying incidents exist (Requirement 9.5).
   */
  private async computeAvgSecondsToInProgress(): Promise<number | null> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch incidents created in the last 30 days with their creation time
    const recentIncidents = await prisma.incident.findMany({
      where: {
        created_at: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        created_at: true,
      },
    });

    if (recentIncidents.length === 0) {
      return null;
    }

    const incidentIds = recentIncidents.map((i) => i.id);
    const createdAtMap = new Map(
      recentIncidents.map((i) => [i.id, i.created_at]),
    );

    // Fetch the earliest audit log entry per incident where status was set to In_Progress
    const inProgressEntries = await prisma.auditLog.findMany({
      where: {
        incident_id: { in: incidentIds },
        operation: 'UPDATE',
        field: 'status',
        new_value: { equals: 'In_Progress' },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (inProgressEntries.length === 0) {
      return null;
    }

    // Take only the first transition per incident
    const seen = new Set<string>();
    const deltas: number[] = [];

    for (const entry of inProgressEntries) {
      if (seen.has(entry.incident_id)) continue;
      seen.add(entry.incident_id);

      const createdAt = createdAtMap.get(entry.incident_id);
      if (!createdAt) continue;

      const deltaSeconds =
        (entry.timestamp.getTime() - createdAt.getTime()) / 1000;
      deltas.push(deltaSeconds);
    }

    if (deltas.length === 0) {
      return null;
    }

    const avg = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
    return Math.round(avg);
  }
}
