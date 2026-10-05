/**
 * Unit tests for IncidentsService
 * Requirements: 2, 4, 6, 7, 8, 11
 *
 * Prisma client is fully mocked — no database connection required.
 */

// ── Env vars (must precede any module importing config.ts) ───────────────────
process.env['JWT_SECRET'] = 'test-secret-for-incidents-service-unit-tests-32!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['AI_API_URL'] = 'https://api.openai.com/v1';
process.env['AI_API_KEY'] = 'test-ai-key';
process.env['NODE_ENV'] = 'test';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../lib/prisma', () => ({
  prisma: {
    incident: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../services/ai.service', () => ({
  analyzeIncident: jest.fn().mockResolvedValue(null),
}));

import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { IncidentsService } from './incidents.service';
import { ValidationError, NotFoundError } from '../../lib/errors';
import { IncidentCategory, IncidentPriority, IncidentStatus } from './incidents.schema';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CREATE_INPUT = {
  title: 'Printer not working',
  description: 'The office printer on floor 2 is not printing anything.',
  category: IncidentCategory.Hardware,
  priority: IncidentPriority.Medium,
};

function makeIncident(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'incident-id-1',
    title: 'Printer not working',
    description: 'The office printer on floor 2 is not printing anything.',
    category: 'Hardware',
    priority: 'Medium',
    status: 'Open',
    submitter_id: 'user-1',
    assigned_to: null,
    assigned_at: null,
    attachment_info: null,
    ai_suggestions: null,
    resolution_detail: null,
    created_at: new Date('2024-01-01T10:00:00Z'),
    updated_at: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  };
}

const EMPLOYEE_USER = { id: 'user-1', role: Role.Employee };
const AGENT_USER = { id: 'agent-1', role: Role.Support_Agent };
const ADMIN_USER = { id: 'admin-1', role: Role.Admin };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let service: IncidentsService;

beforeEach(() => {
  service = new IncidentsService();
  jest.clearAllMocks();

  // Default $transaction: execute the callback with the mocked prisma
  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(mockedPrisma),
  );
});

// ===========================================================================
// createIncident
// ===========================================================================

describe('IncidentsService.createIncident', () => {
  it('creates an incident and returns it on valid input', async () => {
    const created = makeIncident();
    (mockedPrisma.incident.create as jest.Mock).mockResolvedValue(created);
    (mockedPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.createIncident(VALID_CREATE_INPUT, 'user-1');

    expect(result).toEqual(created);
    expect(mockedPrisma.incident.create).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ operation: 'CREATE', actor_id: 'user-1' }),
      }),
    );
  });

  it('throws ValidationError on missing title', async () => {
    const { title: _omit, ...bad } = VALID_CREATE_INPUT;
    await expect(service.createIncident(bad as never, 'user-1')).rejects.toThrow(
      ValidationError,
    );
    expect(mockedPrisma.incident.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError on invalid category', async () => {
    await expect(
      service.createIncident({ ...VALID_CREATE_INPUT, category: 'BadCategory' } as never, 'user-1'),
    ).rejects.toThrow(ValidationError);
  });

  it('creates incident even when AI analysis returns null', async () => {
    const { analyzeIncident } = jest.requireMock('../../services/ai.service');
    analyzeIncident.mockResolvedValueOnce(null);

    const created = makeIncident({ ai_suggestions: null });
    (mockedPrisma.incident.create as jest.Mock).mockResolvedValue(created);
    (mockedPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.createIncident(VALID_CREATE_INPUT, 'user-1');
    expect(result).toBeDefined();
    expect(result.ai_suggestions).toBeNull();
  });
});

// ===========================================================================
// listIncidents
// ===========================================================================

describe('IncidentsService.listIncidents', () => {
  beforeEach(() => {
    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.incident.count as jest.Mock).mockResolvedValue(0);
  });

  it('scopes Employee results to their own submitter_id', async () => {
    await service.listIncidents({}, EMPLOYEE_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.submitter_id).toBe(EMPLOYEE_USER.id);
  });

  it('does not scope Support_Agent results to a single submitter', async () => {
    await service.listIncidents({}, AGENT_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.submitter_id).toBeUndefined();
  });

  it('returns pagination envelope with correct shape', async () => {
    (mockedPrisma.incident.count as jest.Mock).mockResolvedValue(42);

    const result = await service.listIncidents({ page: '2', page_size: '10' }, AGENT_USER);

    expect(result.pagination).toEqual({
      total_count: 42,
      page: 2,
      page_size: 10,
      total_pages: 5,
    });
  });

  it('applies status filter', async () => {
    await service.listIncidents({ status: 'Open' }, AGENT_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.status).toBe('Open');
  });

  it('applies category filter', async () => {
    await service.listIncidents({ category: 'Hardware' }, AGENT_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.category).toBe('Hardware');
  });

  it('applies priority filter', async () => {
    await service.listIncidents({ priority: 'High' }, AGENT_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.priority).toBe('High');
  });

  it('applies case-insensitive search to title and description', async () => {
    await service.listIncidents({ search: 'printer' }, AGENT_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.OR).toEqual([
      { title: { contains: 'printer', mode: 'insensitive' } },
      { description: { contains: 'printer', mode: 'insensitive' } },
    ]);
  });

  it('applies assigned_to filter for Support_Agent', async () => {
    await service.listIncidents(
      { assigned_to: '00000000-0000-0000-0000-000000000001' },
      AGENT_USER,
    );

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assigned_to).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('ignores assigned_to filter for Employee (security scope)', async () => {
    // Employee query: the submitter_id scope is enforced; assigned_to must be
    // silently ignored because the schema only validates UUIDs and employees
    // cannot filter by assignment — pass a valid UUID to avoid schema errors.
    await service.listIncidents(
      { assigned_to: '00000000-0000-0000-0000-000000000001' },
      EMPLOYEE_USER,
    );

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    // Employee where clause should only have submitter_id
    expect(findManyCall.where.submitter_id).toBe(EMPLOYEE_USER.id);
    expect(findManyCall.where.assigned_to).toBeUndefined();
  });

  it('defaults to page 1, page_size 20, sort created_at desc', async () => {
    await service.listIncidents({}, AGENT_USER);

    const findManyCall = (mockedPrisma.incident.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.skip).toBe(0);
    expect(findManyCall.take).toBe(20);
    expect(findManyCall.orderBy).toEqual({ created_at: 'desc' });
  });

  it('throws ValidationError for invalid status value', async () => {
    await expect(
      service.listIncidents({ status: 'BadStatus' }, AGENT_USER),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for page_size > 100', async () => {
    await expect(
      service.listIncidents({ page_size: '101' }, AGENT_USER),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for invalid sort_by', async () => {
    await expect(
      service.listIncidents({ sort_by: 'invalid_field' }, AGENT_USER),
    ).rejects.toThrow(ValidationError);
  });

  it('sorts results by priority in memory when sort_by=priority', async () => {
    const incidents = [
      makeIncident({ id: '1', priority: 'Critical' }),
      makeIncident({ id: '2', priority: 'Low' }),
      makeIncident({ id: '3', priority: 'High' }),
    ];
    (mockedPrisma.incident.findMany as jest.Mock).mockResolvedValue(incidents);
    (mockedPrisma.incident.count as jest.Mock).mockResolvedValue(3);

    const result = await service.listIncidents(
      { sort_by: 'priority', sort_order: 'asc' },
      AGENT_USER,
    );

    const priorities = result.data.map((i) => i.priority);
    expect(priorities).toEqual(['Low', 'High', 'Critical']);
  });
});

// ===========================================================================
// getIncidentById
// ===========================================================================

describe('IncidentsService.getIncidentById', () => {
  it('returns the incident for a Support_Agent', async () => {
    const incident = makeIncident({ submitter_id: 'other-user' });
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(incident);

    const result = await service.getIncidentById('incident-id-1', AGENT_USER);
    expect(result).toEqual(incident);
  });

  it('returns the incident for an Employee who owns it', async () => {
    const incident = makeIncident({ submitter_id: EMPLOYEE_USER.id });
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(incident);

    const result = await service.getIncidentById('incident-id-1', EMPLOYEE_USER);
    expect(result).toEqual(incident);
  });

  it('throws NotFoundError for Employee accessing another users incident', async () => {
    const incident = makeIncident({ submitter_id: 'different-user' });
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(incident);

    await expect(
      service.getIncidentById('incident-id-1', EMPLOYEE_USER),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when incident does not exist', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.getIncidentById('nonexistent', AGENT_USER),
    ).rejects.toThrow(NotFoundError);
  });
});

// ===========================================================================
// updateIncident
// ===========================================================================

describe('IncidentsService.updateIncident', () => {
  it('updates status with a valid transition', async () => {
    const existing = makeIncident({ status: 'Open' });
    const updated = makeIncident({ status: 'In_Progress' });

    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockedPrisma.incident.update as jest.Mock).mockResolvedValue(updated);
    (mockedPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updateIncident(
      'incident-id-1',
      { status: IncidentStatus.In_Progress },
      'agent-1',
      Role.Support_Agent,
    );

    expect(result.status).toBe('In_Progress');
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          field: 'status',
          old_value: 'Open',
          new_value: 'In_Progress',
          operation: 'UPDATE',
        }),
      }),
    );
  });

  it('throws ValidationError for invalid status transition', async () => {
    const existing = makeIncident({ status: 'Open' });
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);

    await expect(
      service.updateIncident(
        'incident-id-1',
        { status: IncidentStatus.Resolved }, // Open → Resolved is invalid
        'agent-1',
        Role.Support_Agent,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('updates priority and writes audit entry', async () => {
    const existing = makeIncident({ priority: 'Low' });
    const updated = makeIncident({ priority: 'High' });

    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockedPrisma.incident.update as jest.Mock).mockResolvedValue(updated);
    (mockedPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updateIncident(
      'incident-id-1',
      { priority: IncidentPriority.High },
      'agent-1',
      Role.Support_Agent,
    );

    expect(result.priority).toBe('High');
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          field: 'priority',
          old_value: 'Low',
          new_value: 'High',
        }),
      }),
    );
  });

  it('validates assignment target must be Support_Agent or Admin', async () => {
    const existing = makeIncident({ status: 'Open' });
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);

    // Assignee is an Employee — should be rejected
    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: Role.Employee,
    });

    await expect(
      service.updateIncident(
        'incident-id-1',
        { assigned_to: '00000000-0000-0000-0000-000000000003' },
        'admin-1',
        Role.Admin,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('allows assignment to a Support_Agent', async () => {
    const agentUuid = '00000000-0000-0000-0000-000000000002';
    const existing = makeIncident({ assigned_to: null });
    const updated = makeIncident({ assigned_to: agentUuid });

    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: Role.Support_Agent,
    });
    (mockedPrisma.incident.update as jest.Mock).mockResolvedValue(updated);
    (mockedPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updateIncident(
      'incident-id-1',
      { assigned_to: agentUuid },
      'admin-1',
      Role.Admin,
    );

    expect(result.assigned_to).toBe(agentUuid);
  });

  it('auto-transitions In_Progress → Resolved when resolution_detail is submitted', async () => {
    const existing = makeIncident({ status: 'In_Progress' });
    const updated = makeIncident({ status: 'Resolved' });

    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockedPrisma.incident.update as jest.Mock).mockResolvedValue(updated);
    (mockedPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updateIncident(
      'incident-id-1',
      {
        resolution_detail: {
          root_cause: 'Hardware failure',
          resolution_steps: 'Replaced the part',
          resolved_at: '2024-01-02T12:00:00Z',
        },
      },
      'agent-1',
      Role.Support_Agent,
    );

    expect(result.status).toBe('Resolved');

    // Audit should record status change
    const auditCalls = (mockedPrisma.auditLog.create as jest.Mock).mock.calls;
    const statusAudit = auditCalls.find(
      (c) => c[0].data.field === 'status',
    );
    expect(statusAudit).toBeDefined();
    expect(statusAudit[0].data.new_value).toBe('Resolved');
  });

  it('throws NotFoundError when incident does not exist', async () => {
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.updateIncident(
        'nonexistent',
        { priority: IncidentPriority.High },
        'agent-1',
        Role.Support_Agent,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when body is empty', async () => {
    const existing = makeIncident();
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);

    await expect(
      service.updateIncident('incident-id-1', {} as never, 'agent-1', Role.Support_Agent),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects invalid assignee UUID format', async () => {
    const existing = makeIncident();
    (mockedPrisma.incident.findUnique as jest.Mock).mockResolvedValue(existing);

    await expect(
      service.updateIncident(
        'incident-id-1',
        { assigned_to: 'not-a-uuid' },
        'agent-1',
        Role.Support_Agent,
      ),
    ).rejects.toThrow(ValidationError);
  });
});
