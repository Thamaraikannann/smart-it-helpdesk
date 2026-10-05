import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createIncident,
  type IncidentCategory,
  type IncidentPriority,
} from '../api/incidents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldErrors {
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
}

// Backend field-level error shape
interface ApiFieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: { value: IncidentCategory; label: string }[] = [
  { value: 'Hardware', label: 'Hardware' },
  { value: 'Software', label: 'Software' },
  { value: 'Network', label: 'Network' },
  { value: 'Access_Permissions', label: 'Access & Permissions' },
  { value: 'Email_Communication', label: 'Email & Communication' },
  { value: 'Other', label: 'Other' },
];

const PRIORITY_OPTIONS: { value: IncidentPriority; label: string }[] = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Critical', label: 'Critical' },
];

function validate(
  title: string,
  description: string,
  category: string,
  priority: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!title.trim()) errors.title = 'Title is required.';
  if (!description.trim()) errors.description = 'Description is required.';
  if (!category) errors.category = 'Category is required.';
  if (!priority) errors.priority = 'Priority is required.';
  return errors;
}

// ---------------------------------------------------------------------------
// Reusable form field components
// ---------------------------------------------------------------------------

function FieldWrapper({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreateIncidentPage() {
  const navigate = useNavigate();

  // ── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IncidentCategory | ''>('');
  const [priority, setPriority] = useState<IncidentPriority | ''>('');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError('');

    // Client-side validation
    const errors = validate(title, description, category, priority);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    try {
      setSubmitting(true);

      const incident = await createIncident({
        title: title.trim(),
        description: description.trim(),
        category: category as IncidentCategory,
        priority: priority as IncidentPriority,
      });

      navigate(`/incidents/${incident.id}`, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: {
            message?: string;
            details?: ApiFieldError[];
          };
        };
      };

      const details = axiosErr?.response?.data?.details;

      // Map backend field-level errors back to the form
      if (details && details.length > 0) {
        const mapped: FieldErrors = {};
        for (const d of details) {
          if (d.field === 'title') mapped.title = d.message;
          else if (d.field === 'description') mapped.description = d.message;
          else if (d.field === 'category') mapped.category = d.message;
          else if (d.field === 'priority') mapped.priority = d.message;
        }
        setFieldErrors(mapped);
        // Also set a general message if there are unmapped errors
        const hasUnmapped = details.some(
          (d) => !['title', 'description', 'category', 'priority'].includes(d.field),
        );
        if (hasUnmapped) {
          setApiError('Some fields have validation errors. Please review and try again.');
        }
      } else {
        const message =
          axiosErr?.response?.data?.message ??
          'Something went wrong. Please try again.';
        setApiError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition ` +
    `focus:ring-2 focus:ring-blue-100 ` +
    (hasError
      ? 'border-red-400 focus:border-red-400'
      : 'border-gray-300 focus:border-blue-500');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/incidents')}
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          aria-label="Back to incidents"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Incidents
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create Incident</h1>
        <p className="mt-1 text-sm text-gray-500">
          Describe your IT issue and we'll route it to the right team.
        </p>
      </div>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* General API error banner */}
        {apiError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
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
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Title */}
          <FieldWrapper
            label="Title"
            htmlFor="title"
            error={fieldErrors.title}
            required
          >
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder="Brief summary of the issue"
              maxLength={200}
              disabled={submitting}
              className={inputClass(!!fieldErrors.title)}
            />
          </FieldWrapper>

          {/* Description */}
          <FieldWrapper
            label="Description"
            htmlFor="description"
            error={fieldErrors.description}
            required
          >
            <textarea
              id="description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErrors.description)
                  setFieldErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="Describe the issue in detail — what happened, when it started, and any steps you've already tried."
              rows={5}
              maxLength={5000}
              disabled={submitting}
              className={inputClass(!!fieldErrors.description)}
            />
          </FieldWrapper>

          {/* Category + Priority — side by side on wider screens */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Category */}
            <FieldWrapper
              label="Category"
              htmlFor="category"
              error={fieldErrors.category}
              required
            >
              <select
                id="category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as IncidentCategory | '');
                  if (fieldErrors.category)
                    setFieldErrors((prev) => ({ ...prev, category: undefined }));
                }}
                disabled={submitting}
                className={inputClass(!!fieldErrors.category)}
              >
                <option value="">Select a category</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldWrapper>

            {/* Priority */}
            <FieldWrapper
              label="Priority"
              htmlFor="priority"
              error={fieldErrors.priority}
              required
            >
              <select
                id="priority"
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as IncidentPriority | '');
                  if (fieldErrors.priority)
                    setFieldErrors((prev) => ({ ...prev, priority: undefined }));
                }}
                disabled={submitting}
                className={inputClass(!!fieldErrors.priority)}
              >
                <option value="">Select a priority</option>
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldWrapper>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/incidents')}
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
