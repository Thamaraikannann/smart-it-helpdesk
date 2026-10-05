/**
 * Tests for IncidentDetailPage
 * Covers: loading/rendering, error/not-found, update panel,
 * invalid update handling, comments rendering, adding a comment,
 * and internal comment behaviour.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import IncidentDetailPage from './IncidentDetailPage';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE = '/api/v1';

const INCIDENT_ID = 'aaaabbbb-0000-0000-0000-000000000001';

function makeIncident(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INCIDENT_ID,
    title: 'Printer not working',
    description: 'The printer on floor 2 is broken.',
    category: 'Hardware',
    priority: 'Medium',
    status: 'Open',
    submitter_id: 'user-0000-0000-0000-000000000001',
    assigned_to: null,
    assigned_at: null,
    attachment_info: null,
    ai_suggestions: null,
    resolution_detail: null,
    created_at: '2024-03-01T10:00:00.000Z',
    updated_at: '2024-03-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeComment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cccccccc-0000-0000-0000-000000000001',
    incident_id: INCIDENT_ID,
    author_id: 'user-0000-0000-0000-000000000001',
    body: 'This is a test comment.',
    is_internal: false,
    created_at: '2024-03-01T11:00:00.000Z',
    ...overrides,
  };
}

const server = setupServer(
  http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
    HttpResponse.json({ data: makeIncident() }),
  ),
  http.get(`${BASE}/incidents/${INCIDENT_ID}/comments`, () =>
    HttpResponse.json({ data: [] }),
  ),
  http.patch(`${BASE}/incidents/${INCIDENT_ID}`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ data: makeIncident(body) });
  }),
  http.post(`${BASE}/incidents/${INCIDENT_ID}/comments`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ data: makeComment(body) }, { status: 201 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function setRole(role: string) {
  localStorage.setItem('auth_user', JSON.stringify({ role }));
}

function renderPage(incidentId = INCIDENT_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/incidents/${incidentId}`]}>
        <Routes>
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/incidents" element={<div data-testid="list-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem('auth_user', JSON.stringify({ role: 'Employee' }));
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncidentDetailPage', () => {

  // ── Loading state ─────────────────────────────────────────────────────────

  it('shows a loading skeleton initially', () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({ data: makeIncident() });
      }),
    );
    renderPage();
    // animate-pulse skeleton divs should be present
    const skeletonDivs = document.querySelectorAll('.animate-pulse');
    expect(skeletonDivs.length).toBeGreaterThan(0);
  });

  // ── Incident rendering ────────────────────────────────────────────────────

  it('renders the incident title after loading', async () => {
    renderPage();
    expect(await screen.findByText('Printer not working')).toBeInTheDocument();
  });

  it('renders the incident description', async () => {
    renderPage();
    expect(
      await screen.findByText('The printer on floor 2 is broken.'),
    ).toBeInTheDocument();
  });

  it('renders status and priority badges', async () => {
    renderPage();
    await screen.findByText('Printer not working');
    // "Open" appears twice: header badge + details row — use getAllByText
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
  });

  it('renders a short ID in monospace', async () => {
    renderPage();
    await screen.findByText('Printer not working');
    expect(screen.getByText('AAAABBBB')).toBeInTheDocument();
  });

  it('renders "Unassigned" when assigned_to is null', async () => {
    renderPage();
    await screen.findByText('Printer not working');
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders resolution detail when present', async () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({
          data: makeIncident({
            status: 'Resolved',
            resolution_detail: {
              root_cause: 'Power cable was loose',
              resolution_steps: 'Reconnected the cable',
              resolved_at: '2024-03-02T12:00:00.000Z',
            },
          }),
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Power cable was loose')).toBeInTheDocument();
    expect(screen.getByText('Reconnected the cable')).toBeInTheDocument();
  });

  it('does NOT render a resolution section when resolution_detail is null', async () => {
    renderPage();
    await screen.findByText('Printer not working');
    expect(screen.queryByText(/resolution/i)).not.toBeInTheDocument();
  });

  it('renders Back to Incidents link', async () => {
    renderPage();
    await screen.findByText('Printer not working');
    expect(screen.getByRole('link', { name: /back to incidents/i })).toBeInTheDocument();
  });

  // ── Error / not-found ─────────────────────────────────────────────────────

  it('shows not-found message on HTTP 404', async () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/incident not found/i)).toBeInTheDocument();
  });

  it('shows generic error message on HTTP 500', async () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/failed to load incident/i)).toBeInTheDocument();
  });

  it('shows a Back to Incidents button on error page', async () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );
    renderPage();
    await screen.findByText(/incident not found/i);
    expect(screen.getByRole('button', { name: /back to incidents/i })).toBeInTheDocument();
  });

  // ── Update panel visibility ───────────────────────────────────────────────

  it('does NOT show the Update panel for Employee role', async () => {
    setRole('Employee');
    renderPage();
    await screen.findByText('Printer not working');
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('shows the Update panel for Support_Agent', async () => {
    setRole('Support_Agent');
    renderPage();
    await screen.findByText('Printer not working');
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows the Update panel for Admin', async () => {
    setRole('Admin');
    renderPage();
    await screen.findByText('Printer not working');
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  // ── Update incident ───────────────────────────────────────────────────────

  it('sends the updated priority to the backend', async () => {
    setRole('Support_Agent');
    let captured: unknown;
    server.use(
      http.patch(`${BASE}/incidents/${INCIDENT_ID}`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: makeIncident({ priority: 'High' }) });
      }),
    );

    renderPage();
    await screen.findByText('Printer not working');

    const prioritySelect = screen.getByLabelText(/priority/i);
    await userEvent.selectOptions(prioritySelect, 'High');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(captured).toMatchObject({ priority: 'High' });
    });
  });

  it('shows success banner after a successful update', async () => {
    setRole('Support_Agent');
    renderPage();
    await screen.findByText('Printer not working');

    const prioritySelect = screen.getByLabelText(/priority/i);
    await userEvent.selectOptions(prioritySelect, 'Critical');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/updated successfully/i);
  });

  it('shows valid status transitions for Open incident', async () => {
    setRole('Support_Agent');
    renderPage();
    await screen.findByText('Printer not working');

    const statusSelect = screen.getByLabelText(/^status$/i);
    const options = Array.from((statusSelect as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    // Open allows In_Progress and On_Hold
    expect(options).toContain('In_Progress');
    expect(options).toContain('On_Hold');
    // Must NOT offer invalid transitions
    expect(options).not.toContain('Resolved');
    expect(options).not.toContain('Closed');
  });

  it('shows no further transitions for a Closed incident', async () => {
    setRole('Support_Agent');
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({ data: makeIncident({ status: 'Closed' }) }),
      ),
    );
    renderPage();
    await screen.findByText('Printer not working');

    expect(
      await screen.findByText(/no further status transitions/i),
    ).toBeInTheDocument();
  });

  it('shows an error banner when saving with no changes', async () => {
    setRole('Support_Agent');
    renderPage();
    await screen.findByText('Printer not working');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/no changes/i);
  });

  it('shows an API error when the backend rejects the update', async () => {
    setRole('Support_Agent');
    server.use(
      http.patch(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json(
          { message: 'Invalid transition' },
          { status: 422 },
        ),
      ),
    );

    renderPage();
    await screen.findByText('Printer not working');

    const prioritySelect = screen.getByLabelText(/priority/i);
    await userEvent.selectOptions(prioritySelect, 'Critical');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid transition/i);
  });

  // ── Resolution detail sub-form ────────────────────────────────────────────

  it('shows resolution detail fields when Resolved status is selected', async () => {
    setRole('Support_Agent');
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({ data: makeIncident({ status: 'In_Progress' }) }),
      ),
    );

    renderPage();
    await screen.findByText('Printer not working');

    const statusSelect = screen.getByLabelText(/^status$/i);
    await userEvent.selectOptions(statusSelect, 'Resolved');

    expect(screen.getByLabelText(/root cause/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resolution steps/i)).toBeInTheDocument();
  });

  // ── Comments rendering ────────────────────────────────────────────────────

  it('shows "No comments yet" when there are no comments', async () => {
    renderPage();
    expect(await screen.findByText(/no comments yet/i)).toBeInTheDocument();
  });

  it('renders existing comments', async () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}/comments`, () =>
        HttpResponse.json({ data: [makeComment()] }),
      ),
    );
    renderPage();
    expect(await screen.findByText('This is a test comment.')).toBeInTheDocument();
  });

  it('renders internal badge on internal comments (for agent)', async () => {
    setRole('Support_Agent');
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}/comments`, () =>
        HttpResponse.json({
          data: [makeComment({ is_internal: true, body: 'Escalating to tier 2.' })],
        }),
      ),
    );
    renderPage();
    await screen.findByText('Escalating to tier 2.');
    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  // ── Adding a comment ──────────────────────────────────────────────────────

  it('adds a comment and refreshes the list', async () => {
    let posted: unknown;
    server.use(
      http.post(`${BASE}/incidents/${INCIDENT_ID}/comments`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          data: makeComment({ body: 'New comment', is_internal: false }),
        });
      }),
    );

    renderPage();

    // Wait for the incident and the initial empty comment state to settle
    await screen.findByText('Printer not working');
    await screen.findByText(/no comments yet/i);

    const textarea = screen.getByLabelText(/comment body/i);
    await userEvent.type(textarea, 'New comment');
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }));

    await waitFor(() => {
      expect(posted).toMatchObject({ body: 'New comment', is_internal: false });
    });
  });

  it('shows a validation error when comment body is empty', async () => {
    renderPage();
    await screen.findByText(/no comments yet/i);
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }));
    expect(await screen.findByText(/comment body is required/i)).toBeInTheDocument();
  });

  it('clears the textarea after successful comment submission', async () => {
    renderPage();
    await screen.findByText(/no comments yet/i);

    const textarea = screen.getByLabelText(/comment body/i);
    await userEvent.type(textarea, 'A comment');
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }));

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });
  });

  // ── Internal comment behaviour ────────────────────────────────────────────

  it('shows the Internal note checkbox for Support_Agent', async () => {
    setRole('Support_Agent');
    renderPage();
    await screen.findByText(/no comments yet/i);
    expect(screen.getByLabelText(/mark as internal note/i)).toBeInTheDocument();
  });

  it('does NOT show Internal note checkbox for Employee', async () => {
    setRole('Employee');
    renderPage();
    await screen.findByText(/no comments yet/i);
    expect(screen.queryByLabelText(/mark as internal note/i)).not.toBeInTheDocument();
  });

  it('sends is_internal: true when Internal note checkbox is checked', async () => {
    setRole('Support_Agent');
    let posted: unknown;
    server.use(
      http.post(`${BASE}/incidents/${INCIDENT_ID}/comments`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          data: makeComment({ is_internal: true }),
        });
      }),
    );

    renderPage();
    await screen.findByText(/no comments yet/i);

    await userEvent.type(screen.getByLabelText(/comment body/i), 'Internal note text');
    await userEvent.click(screen.getByLabelText(/mark as internal note/i));
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }));

    await waitFor(() => {
      expect(posted).toMatchObject({ is_internal: true });
    });
  });

  // ── Closed incident ───────────────────────────────────────────────────────

  it('disables the comment form for a closed incident', async () => {
    server.use(
      http.get(`${BASE}/incidents/${INCIDENT_ID}`, () =>
        HttpResponse.json({ data: makeIncident({ status: 'Closed' }) }),
      ),
    );
    renderPage();
    await screen.findByText('Printer not working');
    expect(
      screen.queryByRole('button', { name: /add comment/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/comments are disabled for closed incidents/i),
    ).toBeInTheDocument();
  });
});
