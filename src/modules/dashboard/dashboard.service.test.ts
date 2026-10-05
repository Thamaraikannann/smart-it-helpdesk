/**
 * Unit tests for DashboardService
 * Requirement 9: Admin Dashboard
 *
 * Prisma client is fully mocked — no database connection required.
 */

// ── Env vars ─────────────────────────────────────────────────────────────────
process.env['JWT_SECRET'] = 'test-secret-for-dashboard-service-unit-tests-32!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['AI_API_URL'] = 'https://api.openai.com/v1';
process.env['AI_API_KEY'] = 'test-ai-key';
process.env['NODE_ENV'] = 'test';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../lib/prisma', () => ({
  prisma: {
    incident: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';
import { DashboardService } from './dashboard.service';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal groupBy result row */
function statusRow(status: string, count: number) {
  return { status, _count: { id: count } };
}
function priorityRow(priority: string, count: number) {
  return { priority, _count: { id: count } };
}
function categoryRow(category: string, count: number) {
  return { category, _count: { id: count } };
}

/** Defaults: empty groupBy results, 0 count, no recent incidents */
function setupDefaults() {
  (mockedPrisma.incident.groupBy as jest.Mock).mockResolvedValue([]);
  (mockedPrisma.incident.count as jest.Mock).mockResolvedValue(0);
  (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([]);
  (mockedPrisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let service: DashboardService;

beforeEach(() => {
  service = new DashboardService();
  jest.clearAllMocks();
  setupDefaults();
});

// ===========================================================================
// getDashboardMetrics — response shape
// ===========================================================================

describe('DashboardService.getDashboardMetrics', () => {

  it('returns an object with all required top-level keys', async () => {
    const metrics = await service.getDashboardMetrics();

    expect(metrics).toHaveProperty('total_incidents');
    expect(metrics).toHaveProperty('by_status');
    expect(metrics).toHaveProperty('by_priority');
    expect(metrics).toHaveProperty('by_category');
    expect(metrics).toHaveProperty('unassigned_open_count');
    expect(metrics).toHaveProperty('avg_seconds_to_in_progress');
  });

  it('returns empty arrays and zeros when database has no incidents', async () => {
    const metrics = await service.getDashboardMetrics();

    expect(metrics.total_incidents).toBe(0);
    expect(metrics.by_status).toEqual([]);
    expect(metrics.by_priority).toEqual([]);
    expect(metrics.by_category).toEqual([]);
    expect(metrics.unassigned_open_count).toBe(0);
    expect(metrics.avg_seconds_to_in_progress).toBeNull();
  });

  // ── total_incidents ────────────────────────────────────────────────────────

  it('total_incidents sums all status counts', async () => {
    (mockedPrisma.incident.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        statusRow('Open', 5),
        statusRow('In_Progress', 3),
        statusRow('Resolved', 2),
      ]) // by status
      .mockResolvedValueOnce([]) // by priority
      .mockResolvedValueOnce([]); // by category

    const metrics = await service.getDashboardMetrics();

    expect(metrics.total_incidents).toBe(10);
  });

  it('total_incidents is 0 when all groupBy results are empty', async () => {
    const metrics = await service.getDashboardMetrics();
    expect(metrics.total_incidents).toBe(0);
  });

  // ── by_status ──────────────────────────────────────────────────────────────

  it('by_status contains correct status and count fields', async () => {
    (mockedPrisma.incident.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        statusRow('Open', 7),
        statusRow('Closed', 2),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.by_status).toEqual(
      expect.arrayContaining([
        { status: 'Open', count: 7 },
        { status: 'Closed', count: 2 },
      ]),
    );
  });

  it('by_status entries each have a string status and numeric count', async () => {
    (mockedPrisma.incident.groupBy as jest.Mock)
      .mockResolvedValueOnce([statusRow('On_Hold', 4)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const metrics = await service.getDashboardMetrics();

    for (const entry of metrics.by_status) {
      expect(typeof entry.status).toBe('string');
      expect(typeof entry.count).toBe('number');
    }
  });

  // ── by_priority ────────────────────────────────────────────────────────────

  it('by_priority contains correct priority and count fields', async () => {
    (mockedPrisma.incident.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // by status
      .mockResolvedValueOnce([
        priorityRow('Critical', 3),
        priorityRow('Low', 10),
      ])
      .mockResolvedValueOnce([]);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.by_priority).toEqual(
      expect.arrayContaining([
        { priority: 'Critical', count: 3 },
        { priority: 'Low', count: 10 },
      ]),
    );
  });

  it('by_priority is empty when no incidents exist', async () => {
    const metrics = await service.getDashboardMetrics();
    expect(metrics.by_priority).toEqual([]);
  });

  // ── by_category ────────────────────────────────────────────────────────────

  it('by_category contains correct category and count fields', async () => {
    (mockedPrisma.incident.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // by status
      .mockResolvedValueOnce([]) // by priority
      .mockResolvedValueOnce([
        categoryRow('Hardware', 6),
        categoryRow('Network', 2),
        categoryRow('Software', 1),
      ]);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.by_category).toEqual(
      expect.arrayContaining([
        { category: 'Hardware', count: 6 },
        { category: 'Network', count: 2 },
        { category: 'Software', count: 1 },
      ]),
    );
  });

  it('by_category is empty when no incidents exist', async () => {
    const metrics = await service.getDashboardMetrics();
    expect(metrics.by_category).toEqual([]);
  });

  // ── unassigned_open_count ──────────────────────────────────────────────────

  it('returns the correct unassigned open count (Requirement 9.4)', async () => {
    (mockedPrisma.incident.count as jest.Mock).mockResolvedValue(4);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.unassigned_open_count).toBe(4);
    expect(mockedPrisma.incident.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'Open',
          assigned_to: null,
        }),
      }),
    );
  });

  it('unassigned_open_count is 0 when all open incidents are assigned', async () => {
    (mockedPrisma.incident.count as jest.Mock).mockResolvedValue(0);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.unassigned_open_count).toBe(0);
  });

  // ── avg_seconds_to_in_progress ────────────────────────────────────────────

  it('returns null when no incidents were created in the past 30 days (Requirement 9.5)', async () => {
    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([]);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.avg_seconds_to_in_progress).toBeNull();
  });

  it('returns null when recent incidents have no In_Progress audit entries', async () => {
    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([
      { id: 'inc-1', created_at: new Date(Date.now() - 1000 * 60 * 60) },
    ]);
    (mockedPrisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.avg_seconds_to_in_progress).toBeNull();
  });

  it('computes average seconds correctly for a single incident', async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const inProgressAt = new Date(createdAt.getTime() + 3600 * 1000); // 1 hour later

    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([
      { id: 'inc-1', created_at: createdAt },
    ]);
    (mockedPrisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        incident_id: 'inc-1',
        operation: 'UPDATE',
        field: 'status',
        new_value: 'In_Progress',
        timestamp: inProgressAt,
      },
    ]);

    const metrics = await service.getDashboardMetrics();

    // Delta = 3600 seconds (1 hour)
    expect(metrics.avg_seconds_to_in_progress).toBe(3600);
  });

  it('computes average seconds correctly for multiple incidents', async () => {
    const now = Date.now();
    const createdAt1 = new Date(now - 5 * 60 * 60 * 1000); // 5h ago
    const createdAt2 = new Date(now - 3 * 60 * 60 * 1000); // 3h ago

    // incident-1 took 2h = 7200s, incident-2 took 1h = 3600s → avg = 5400s
    const inProgressAt1 = new Date(createdAt1.getTime() + 2 * 3600 * 1000);
    const inProgressAt2 = new Date(createdAt2.getTime() + 1 * 3600 * 1000);

    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([
      { id: 'inc-1', created_at: createdAt1 },
      { id: 'inc-2', created_at: createdAt2 },
    ]);
    (mockedPrisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        incident_id: 'inc-1',
        operation: 'UPDATE',
        field: 'status',
        new_value: 'In_Progress',
        timestamp: inProgressAt1,
      },
      {
        id: 'audit-2',
        incident_id: 'inc-2',
        operation: 'UPDATE',
        field: 'status',
        new_value: 'In_Progress',
        timestamp: inProgressAt2,
      },
    ]);

    const metrics = await service.getDashboardMetrics();

    expect(metrics.avg_seconds_to_in_progress).toBe(5400);
  });

  it('uses only the first In_Progress transition per incident', async () => {
    const createdAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
    // First transition: 1h after creation = 3600s
    const first = new Date(createdAt.getTime() + 3600 * 1000);
    // Second transition (e.g., re-opened and moved back): 3h after = 10800s
    const second = new Date(createdAt.getTime() + 3 * 3600 * 1000);

    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([
      { id: 'inc-1', created_at: createdAt },
    ]);
    // auditLog.findMany returns ordered by timestamp asc — first entry wins
    (mockedPrisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        incident_id: 'inc-1',
        operation: 'UPDATE',
        field: 'status',
        new_value: 'In_Progress',
        timestamp: first,
      },
      {
        id: 'audit-2',
        incident_id: 'inc-1',
        operation: 'UPDATE',
        field: 'status',
        new_value: 'In_Progress',
        timestamp: second,
      },
    ]);

    const metrics = await service.getDashboardMetrics();

    // Should use the first transition (3600s), not average with the second
    expect(metrics.avg_seconds_to_in_progress).toBe(3600);
  });

  it('queries auditLog with the correct filter for In_Progress transitions', async () => {
    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([
      { id: 'inc-1', created_at: new Date(Date.now() - 3600 * 1000) },
    ]);
    (mockedPrisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

    await service.getDashboardMetrics();

    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          operation: 'UPDATE',
          field: 'status',
          new_value: { equals: 'In_Progress' },
        }),
      }),
    );
  });

  // ── Parallel query execution ───────────────────────────────────────────────

  it('calls groupBy three times — once each for status, priority, and category', async () => {
    await service.getDashboardMetrics();

    expect(mockedPrisma.incident.groupBy).toHaveBeenCalledTimes(3);
  });

  it('calls incident.count once for unassigned open incidents', async () => {
    await service.getDashboardMetrics();

    expect(mockedPrisma.incident.count).toHaveBeenCalledTimes(1);
  });
});
