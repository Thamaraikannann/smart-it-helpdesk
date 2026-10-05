import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchIncident,
  updateIncident,
  ALLOWED_TRANSITIONS,
  type Incident,
  type IncidentStatus,
  type IncidentPriority,
  type UpdateIncidentPayload,
  type ResolutionDetail,
} from '../api/incidents';
import { fetchComments, addComment, type Comment } from '../api/comments';

// ---------------------------------------------------------------------------
// Helpers / constants
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

const PRIORITY_OPTIONS: IncidentPriority[] = ['Low', 'Medium', 'High', 'Critical'];

function formatLabel(s: string) {
  return s.replace(/_/g, ' ');
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
// Small reusable UI pieces
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 text-sm">
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="col-span-2 text-gray-900">{children}</dd>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
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

function ApiErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {message}
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
    >
      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolution detail card
// ---------------------------------------------------------------------------

interface RawResolutionDetail {
  root_cause?: string;
  resolution_steps?: string;
  resolved_at?: string;
}

function ResolutionCard({ resolutionDetail }: { resolutionDetail: unknown }) {
  const rd = resolutionDetail as RawResolutionDetail;
  return (
    <SectionCard title="Resolution">
      <dl className="divide-y divide-gray-100 text-sm">
        {rd.root_cause ? (
          <DetailRow label="Root Cause">
            <span className="whitespace-pre-wrap">{rd.root_cause}</span>
          </DetailRow>
        ) : null}
        {rd.resolution_steps ? (
          <DetailRow label="Resolution Steps">
            <span className="whitespace-pre-wrap">{rd.resolution_steps}</span>
          </DetailRow>
        ) : null}
        {rd.resolved_at ? (
          <DetailRow label="Resolved At">{formatDate(rd.resolved_at)}</DetailRow>
        ) : null}
      </dl>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Comments section
// ---------------------------------------------------------------------------

function CommentsSection({
  incidentId,
  role,
  isClosed,
}: {
  incidentId: string;
  role: string;
  isClosed: boolean;
}) {
  const queryClient = useQueryClient();

  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [bodyError, setBodyError] = useState('');

  const { data: comments, isLoading, isError } = useQuery({
    queryKey: ['comments', incidentId],
    queryFn: () => fetchComments(incidentId),
  });

  const mutation = useMutation({
    mutationFn: (payload: { body: string; is_internal: boolean }) =>
      addComment(incidentId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['comments', incidentId] });
      setBody('');
      setIsInternal(false);
      setBodyError('');
    },
  });

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setBodyError('Comment body is required.');
      return;
    }
    setBodyError('');
    mutation.mutate({ body: body.trim(), is_internal: isInternal });
  }

  const canComment = !isClosed;
  const canInternal = isAgentOrAdmin(role);

  return (
    <SectionCard title="Comments">
      {/* List */}
      {isLoading && (
        <p className="text-sm text-gray-400">Loading comments…</p>
      )}
      {isError && (
        <p className="text-sm text-red-500">Failed to load comments.</p>
      )}
      {comments && comments.length === 0 && (
        <p className="text-sm text-gray-400">No comments yet.</p>
      )}
      {comments && comments.length > 0 && (
        <ul className="mb-5 space-y-3" aria-label="Comments list">
          {comments.map((c: Comment) => (
            <li
              key={c.id}
              className={`rounded-lg border px-4 py-3 text-sm ${
                c.is_internal
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-xs text-gray-400">
                  {c.author_id.slice(0, 8)}
                </span>
                {c.is_internal && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    Internal
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  {formatDate(c.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-gray-800">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Add comment form */}
      {canComment ? (
        <form onSubmit={handleSubmitComment} noValidate>
          {mutation.isError && (
            <div className="mb-3">
              <ApiErrorBanner
                message={
                  (
                    mutation.error as {
                      response?: { data?: { message?: string } };
                    }
                  )?.response?.data?.message ??
                  'Failed to add comment. Please try again.'
                }
              />
            </div>
          )}
          <textarea
            id="comment-body"
            aria-label="Comment body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (bodyError) setBodyError('');
            }}
            placeholder="Add a comment…"
            rows={3}
            maxLength={2000}
            disabled={mutation.isPending}
            className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 ${
              bodyError
                ? 'border-red-400 focus:border-red-400'
                : 'border-gray-300 focus:border-blue-500'
            }`}
          />
          {bodyError && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {bodyError}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            {canInternal && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  disabled={mutation.isPending}
                  aria-label="Mark as internal note"
                  className="h-4 w-4 rounded border-gray-300"
                />
                Internal note
              </label>
            )}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? 'Posting…' : 'Add Comment'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-gray-400">
          Comments are disabled for closed incidents.
        </p>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Update panel (Support_Agent / Admin only)
// ---------------------------------------------------------------------------

function UpdatePanel({
  incident,
  onUpdated,
}: {
  incident: Incident;
  onUpdated: (updated: Incident) => void;
}) {
  const queryClient = useQueryClient();

  // Derive allowed next statuses from current status
  const allowedStatuses = ALLOWED_TRANSITIONS[incident.status] ?? [];

  // Local form state — initialised from incident
  const [newStatus, setNewStatus] = useState<IncidentStatus | ''>('');
  const [newPriority, setNewPriority] = useState<IncidentPriority>(incident.priority);
  const [assignedTo, setAssignedTo] = useState(incident.assigned_to ?? '');

  // Resolution detail sub-form (only relevant when moving to Resolved)
  const [showResolution, setShowResolution] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [resolutionSteps, setResolutionSteps] = useState('');

  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Keep local state in sync if incident prop changes (e.g. after refetch)
  useEffect(() => {
    setNewPriority(incident.priority);
    setAssignedTo(incident.assigned_to ?? '');
    setNewStatus('');
    setShowResolution(false);
    setRootCause('');
    setResolutionSteps('');
  }, [incident.id, incident.status, incident.priority, incident.assigned_to]);

  const mutation = useMutation({
    mutationFn: (payload: UpdateIncidentPayload) =>
      updateIncident(incident.id, payload),
    onSuccess: (updated) => {
      onUpdated(updated);
      void queryClient.invalidateQueries({ queryKey: ['incident', incident.id] });
      setUpdateSuccess('Incident updated successfully.');
      setUpdateError('');
      setNewStatus('');
      setShowResolution(false);
      setRootCause('');
      setResolutionSteps('');
      setTimeout(() => setUpdateSuccess(''), 4000);
    },
    onError: (err: unknown) => {
      const axiosErr = err as {
        response?: { data?: { message?: string; details?: { field: string; message: string }[] } };
      };
      const details = axiosErr?.response?.data?.details;
      if (details && details.length > 0) {
        setUpdateError(details.map((d) => d.message).join(' '));
      } else {
        setUpdateError(
          axiosErr?.response?.data?.message ?? 'Update failed. Please try again.',
        );
      }
      setUpdateSuccess('');
    },
  });

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setUpdateError('');
    setUpdateSuccess('');

    const payload: UpdateIncidentPayload = {};

    if (newStatus) payload.status = newStatus as IncidentStatus;
    if (newPriority !== incident.priority) payload.priority = newPriority;

    const trimmedAssigned = assignedTo.trim();
    const currentAssigned = incident.assigned_to ?? '';
    if (trimmedAssigned !== currentAssigned) {
      payload.assigned_to = trimmedAssigned || null;
    }

    if (showResolution) {
      if (!rootCause.trim() || !resolutionSteps.trim()) {
        setUpdateError('Root cause and resolution steps are required for resolution detail.');
        return;
      }
      const resolution: ResolutionDetail = {
        root_cause: rootCause.trim(),
        resolution_steps: resolutionSteps.trim(),
        resolved_at: new Date().toISOString(),
      };
      payload.resolution_detail = resolution;
    }

    if (Object.keys(payload).length === 0) {
      setUpdateError('No changes to save.');
      return;
    }

    mutation.mutate(payload);
  }

  const inputCls =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (
    <SectionCard title="Update Incident">
      {updateError && (
        <div className="mb-4">
          <ApiErrorBanner message={updateError} />
        </div>
      )}
      {updateSuccess && (
        <div className="mb-4">
          <SuccessBanner message={updateSuccess} />
        </div>
      )}

      <form onSubmit={handleUpdate} noValidate className="space-y-4">
        {/* Status */}
        <div>
          <label htmlFor="update-status" className="mb-1.5 block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="update-status"
            value={newStatus}
            onChange={(e) => {
              const val = e.target.value as IncidentStatus | '';
              setNewStatus(val);
              setShowResolution(val === 'Resolved');
            }}
            disabled={mutation.isPending || allowedStatuses.length === 0}
            className={inputCls}
          >
            <option value="">— Keep current ({formatLabel(incident.status)}) —</option>
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>
                {formatLabel(s)}
              </option>
            ))}
          </select>
          {allowedStatuses.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">No further status transitions available.</p>
          )}
        </div>

        {/* Resolution detail (shown when Resolved is selected) */}
        {showResolution && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Resolution Detail
            </p>
            <div>
              <label htmlFor="root-cause" className="mb-1 block text-sm font-medium text-gray-700">
                Root Cause <span className="text-red-500">*</span>
              </label>
              <textarea
                id="root-cause"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                rows={2}
                disabled={mutation.isPending}
                placeholder="What caused the issue?"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="resolution-steps" className="mb-1 block text-sm font-medium text-gray-700">
                Resolution Steps <span className="text-red-500">*</span>
              </label>
              <textarea
                id="resolution-steps"
                value={resolutionSteps}
                onChange={(e) => setResolutionSteps(e.target.value)}
                rows={2}
                disabled={mutation.isPending}
                placeholder="What steps were taken to resolve it?"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* Priority */}
        <div>
          <label htmlFor="update-priority" className="mb-1.5 block text-sm font-medium text-gray-700">
            Priority
          </label>
          <select
            id="update-priority"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as IncidentPriority)}
            disabled={mutation.isPending}
            className={inputCls}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Assigned to */}
        <div>
          <label htmlFor="assigned-to" className="mb-1.5 block text-sm font-medium text-gray-700">
            Assigned To <span className="text-xs font-normal text-gray-400">(user ID)</span>
          </label>
          <input
            id="assigned-to"
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="UUID of agent to assign, or leave blank to unassign"
            disabled={mutation.isPending}
            className={inputCls}
          />
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = getRole();

  // Track the latest incident data locally so UpdatePanel changes reflect
  // immediately without waiting for a full refetch.
  const [localIncident, setLocalIncident] = useState<Incident | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => fetchIncident(id!),
    enabled: !!id,
  });

  // Keep localIncident in sync with query data
  useEffect(() => {
    if (data) setLocalIncident(data);
  }, [data]);

  const incident = localIncident ?? data;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/3 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-5/6 rounded bg-gray-200" />
          <div className="h-4 w-2/3 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  // ── Error / not found ────────────────────────────────────────────────────
  if (isError || !incident) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const is404 = status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/incidents"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Incidents
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-lg font-semibold text-red-700" role="alert">
            {is404 ? 'Incident not found.' : 'Failed to load incident.'}
          </p>
          <p className="mt-1 text-sm text-red-500">
            {is404
              ? 'This incident does not exist or you do not have access.'
              : 'An unexpected error occurred. Please try again.'}
          </p>
          <button
            onClick={() => navigate('/incidents')}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Back to Incidents
          </button>
        </div>
      </div>
    );
  }

  const isClosed = incident.status === 'Closed';
  const canManage = isAgentOrAdmin(role);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Back button */}
      <Link
        to="/incidents"
        className="mb-5 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        aria-label="Back to incidents"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Incidents
      </Link>

      {/* Title + badges */}
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-gray-400">{incident.id.slice(0, 8).toUpperCase()}</span>
          <StatusBadge status={incident.status} />
          <PriorityBadge priority={incident.priority} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{incident.title}</h1>
      </div>

      <div className="space-y-5">
        {/* Details card */}
        <SectionCard title="Details">
          <dl className="divide-y divide-gray-100">
            <DetailRow label="Description">
              <span className="whitespace-pre-wrap">{incident.description}</span>
            </DetailRow>
            <DetailRow label="Category">{formatLabel(incident.category)}</DetailRow>
            <DetailRow label="Priority">
              <PriorityBadge priority={incident.priority} />
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={incident.status} />
            </DetailRow>
            <DetailRow label="Submitter">
              <span className="font-mono text-xs">{incident.submitter_id}</span>
            </DetailRow>
            <DetailRow label="Assigned To">
              {incident.assigned_to ? (
                <span className="font-mono text-xs">{incident.assigned_to}</span>
              ) : (
                <span className="text-gray-400">Unassigned</span>
              )}
            </DetailRow>
            <DetailRow label="Created">{formatDate(incident.created_at)}</DetailRow>
            <DetailRow label="Updated">{formatDate(incident.updated_at)}</DetailRow>
          </dl>
        </SectionCard>

        {/* Resolution detail (when present) */}
        {incident.resolution_detail ? (
          <ResolutionCard resolutionDetail={incident.resolution_detail} />
        ) : null}

        {/* Update panel — agent/admin only */}
        {canManage && (
          <UpdatePanel
            incident={incident}
            onUpdated={(updated) => setLocalIncident(updated)}
          />
        )}

        {/* Comments */}
        <CommentsSection
          incidentId={incident.id}
          role={role}
          isClosed={isClosed}
        />
      </div>
    </div>
  );
}
