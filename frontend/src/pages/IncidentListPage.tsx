import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  fetchIncidents,
  type Incident,
  type IncidentStatus,
  type IncidentPriority,
  type IncidentCategory,
  type IncidentListParams,
} from '../api/incidents';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<IncidentStatus, string> = {
  Open: 'bg-blue-100 text-blue-800',
  In_Progress: 'bg-yellow-100 text-yellow-800',
  On_Hold: 'bg-orange-100 text-orange-800',
  Resolved: 'bg-green-100 text-green-800',
  Closed: 'bg-gray-100 text-gray-600',
};

const PRIORITY_STYLES: Record<IncidentPriority, string> = {
  Low: 'bg-slate-100 text-slate-700',
  Medium: 'bg-sky-100 text-sky-700',
  High: 'bg-amber-100 text-amber-700',
  Critical: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: IncidentStatus }) {
  const label = status.replace('_', ' ');
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {priority}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 rounded bg-gray-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <svg
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm font-medium">
            {hasFilters ? 'No incidents match your filters.' : 'No incidents yet.'}
          </p>
          {hasFilters && (
            <p className="text-xs">Try clearing your search or filters.</p>
          )}
        </div>
      </td>
    </tr>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {message}
        </div>
      </td>
    </tr>
  );
}

function IncidentRow({
  incident,
  onClick,
}: {
  incident: Incident;
  onClick: (id: string) => void;
}) {
  return (
    <tr
      className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
      onClick={() => onClick(incident.id)}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(incident.id)}
      aria-label={`View incident ${incident.title}`}
    >
      <td className="px-4 py-3 font-mono text-xs text-gray-500">
        {shortId(incident.id)}
      </td>
      <td className="max-w-xs px-4 py-3">
        <p className="truncate font-medium text-gray-900">{incident.title}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatCategory(incident.category)}
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={incident.priority} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={incident.status} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {incident.assigned_to ? (
          <span className="font-mono text-xs">{incident.assigned_to.slice(0, 8)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(incident.created_at)}
      </td>
    </tr>
  );
}

function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
      <p className="text-sm text-gray-500">
        {totalCount === 0
          ? 'No results'
          : `Showing ${from}–${to} of ${totalCount}`}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <span className="px-2 text-sm text-gray-700">
          {page} / {totalPages || 1}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export default function IncidentListPage() {
  const navigate = useNavigate();

  // ── Filter / search state ─────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const [category, setCategory] = useState<IncidentCategory | ''>('');
  const [priority, setPriority] = useState<IncidentPriority | ''>('');
  const [page, setPage] = useState(1);

  // ── Derived query params ──────────────────────────────────────────────────
  const queryParams: IncidentListParams = {
    page,
    page_size: PAGE_SIZE,
    sort_by: 'created_at',
    sort_order: 'desc',
    ...(committedSearch && { search: committedSearch }),
    ...(status && { status }),
    ...(category && { category }),
    ...(priority && { priority }),
  };

  const hasFilters = !!(committedSearch || status || category || priority);

  // ── TanStack Query ────────────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['incidents', queryParams],
    queryFn: () => fetchIncidents(queryParams),
    placeholderData: keepPreviousData,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    setCommittedSearch(search.trim());
    setPage(1);
  }, [search]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  const handleFilterChange = useCallback(() => {
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setCommittedSearch('');
    setStatus('');
    setCategory('');
    setPriority('');
    setPage(1);
  }, []);

  const handleRowClick = useCallback(
    (id: string) => navigate(`/incidents/${id}`),
    [navigate],
  );

  const errorMessage =
    isError
      ? (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? 'Failed to load incidents. Please try again.'
      : '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          {data && (
            <p className="mt-1 text-sm text-gray-500">
              {data.pagination.total_count}{' '}
              {data.pagination.total_count === 1 ? 'incident' : 'incidents'} total
            </p>
          )}
        </div>

        <button
          onClick={() => navigate('/incidents/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Incident
        </button>
      </div>

      {/* ── Search + Filters ───────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-3">
        {/* Search */}
        <div className="flex min-w-[240px] flex-1 items-center rounded-lg border border-gray-300 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
          <svg
            className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by title or description…"
            className="w-full py-2.5 text-sm outline-none placeholder:text-gray-400"
            aria-label="Search incidents"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setCommittedSearch('');
                setPage(1);
              }}
              className="ml-1 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={handleSearch}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Search
        </button>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as IncidentStatus | '');
            handleFilterChange();
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="In_Progress">In Progress</option>
          <option value="On_Hold">On Hold</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>

        {/* Category filter */}
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as IncidentCategory | '');
            handleFilterChange();
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          <option value="Hardware">Hardware</option>
          <option value="Software">Software</option>
          <option value="Network">Network</option>
          <option value="Access_Permissions">Access &amp; Permissions</option>
          <option value="Email_Communication">Email &amp; Communication</option>
          <option value="Other">Other</option>
        </select>

        {/* Priority filter */}
        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value as IncidentPriority | '');
            handleFilterChange();
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          aria-label="Filter by priority"
        >
          <option value="">All Priorities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={handleClearFilters}
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Clear all filters"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned To</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRows />
              ) : isError ? (
                <ErrorState message={errorMessage} />
              ) : !data || data.data.length === 0 ? (
                <EmptyState hasFilters={hasFilters} />
              ) : (
                data.data.map((incident) => (
                  <IncidentRow
                    key={incident.id}
                    incident={incident}
                    onClick={handleRowClick}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.total_pages > 0 && (
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.total_pages}
            totalCount={data.pagination.total_count}
            pageSize={data.pagination.page_size}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
