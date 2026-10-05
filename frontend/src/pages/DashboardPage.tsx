import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  fetchDashboard,
  type DashboardMetrics,
  type StatusCount,
  type PriorityCount,
  type CategoryCount,
} from '../api/dashboard';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function getRole(): string {
  try {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return '';
    return (JSON.parse(raw) as { role?: string }).role ?? '';
  } catch {
    return '';
  }
}

function isAgentOrAdmin(role: string) {
  return role === 'Support_Agent' || role === 'Admin';
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar row — simple proportional bar without animations
// ---------------------------------------------------------------------------

function BarRow({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <span className="w-36 flex-shrink-0 truncate text-gray-700">
        {formatLabel(label)}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-2.5 rounded-full ${colorClass}`}
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${formatLabel(label)}: ${count}`}
        />
      </div>
      <span className="w-8 text-right font-medium tabular-nums text-gray-900">
        {count}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status colours
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  Open: 'bg-blue-400',
  In_Progress: 'bg-yellow-400',
  On_Hold: 'bg-orange-400',
  Resolved: 'bg-green-400',
  Closed: 'bg-gray-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: 'bg-slate-400',
  Medium: 'bg-sky-400',
  High: 'bg-amber-400',
  Critical: 'bg-red-400',
};

const CATEGORY_COLOR = 'bg-indigo-400';

// ---------------------------------------------------------------------------
// Main dashboard content
// ---------------------------------------------------------------------------

function DashboardContent({ metrics }: { metrics: DashboardMetrics }) {
  const totalForStatus = metrics.by_status.reduce((s, r) => s + r.count, 0);
  const totalForPriority = metrics.by_priority.reduce((s, r) => s + r.count, 0);
  const totalForCategory = metrics.by_category.reduce((s, r) => s + r.count, 0);

  const avgDisplay =
    metrics.avg_seconds_to_in_progress !== null
      ? formatSeconds(metrics.avg_seconds_to_in_progress)
      : '—';

  return (
    <div className="space-y-6">
      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Summary cards"
      >
        <StatCard
          label="Total Incidents"
          value={metrics.total_incidents}
        />
        <StatCard
          label="Unassigned Open"
          value={metrics.unassigned_open_count}
          sub="Open incidents with no assignee"
        />
        <StatCard
          label="Avg. Time to In Progress"
          value={avgDisplay}
          sub={
            metrics.avg_seconds_to_in_progress !== null
              ? 'Last 30 days'
              : 'No data yet'
          }
        />
      </div>

      {/* ── By status ─────────────────────────────────────────────────────── */}
      <SectionCard title="By Status">
        {metrics.by_status.length === 0 ? (
          <p className="text-sm text-gray-400">No data.</p>
        ) : (
          <div aria-label="Incidents by status">
            {metrics.by_status.map((row: StatusCount) => (
              <BarRow
                key={row.status}
                label={row.status}
                count={row.count}
                total={totalForStatus}
                colorClass={STATUS_COLORS[row.status] ?? 'bg-gray-400'}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── By priority ───────────────────────────────────────────────────── */}
      <SectionCard title="By Priority">
        {metrics.by_priority.length === 0 ? (
          <p className="text-sm text-gray-400">No data.</p>
        ) : (
          <div aria-label="Incidents by priority">
            {metrics.by_priority.map((row: PriorityCount) => (
              <BarRow
                key={row.priority}
                label={row.priority}
                count={row.count}
                total={totalForPriority}
                colorClass={PRIORITY_COLORS[row.priority] ?? 'bg-gray-400'}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── By category ───────────────────────────────────────────────────── */}
      <SectionCard title="By Category">
        {metrics.by_category.length === 0 ? (
          <p className="text-sm text-gray-400">No data.</p>
        ) : (
          <div aria-label="Incidents by category">
            {metrics.by_category.map((row: CategoryCount) => (
              <BarRow
                key={row.category}
                label={row.category}
                count={row.count}
                total={totalForCategory}
                colorClass={CATEGORY_COLOR}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate();
  const role = getRole();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    // Don't even fire the request if the user is an Employee — the backend
    // will 403 anyway, but we give a better UX by catching it early.
    enabled: isAgentOrAdmin(role),
  });

  // ── Access control ───────────────────────────────────────────────────────
  if (!isAgentOrAdmin(role)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-semibold text-gray-700" role="alert">
          Access Denied
        </p>
        <p className="mt-1 text-sm text-gray-500">
          The dashboard is available to Support Agents and Administrators only.
        </p>
        <button
          onClick={() => navigate('/incidents')}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Incidents
        </button>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 h-8 w-40 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-gray-200 bg-white px-5 py-4"
            >
              <div className="mb-2 h-4 w-24 rounded bg-gray-200" />
              <div className="h-8 w-16 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const msg =
      status === 403
        ? 'You do not have permission to view the dashboard.'
        : 'Failed to load dashboard data. Please try again.';
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-semibold text-red-600" role="alert">
          {msg}
        </p>
        <button
          onClick={() => navigate('/incidents')}
          className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Incidents
        </button>
      </div>
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live incident metrics across the whole system.
        </p>
      </div>
      {data ? (
        <DashboardContent metrics={data} />
      ) : null}
    </div>
  );
}
