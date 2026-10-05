/**
 * Tests for CreateIncidentPage
 * Covers: rendering, client-side validation, successful submission,
 * API error handling, and navigation behaviour.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateIncidentPage from './CreateIncidentPage';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE = '/api/v1';

const CREATED_INCIDENT = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  title: 'Printer not working',
  description: 'The printer on floor 2 is broken.',
  category: 'Hardware',
  priority: 'Medium',
  status: 'Open',
  submitter_id: 'user-1',
  assigned_to: null,
  assigned_at: null,
  attachment_info: null,
  ai_suggestions: null,
  resolution_detail: null,
  created_at: '2024-03-01T10:00:00.000Z',
  updated_at: '2024-03-01T10:00:00.000Z',
};

const server = setupServer(
  http.post(`${BASE}/incidents`, () =>
    HttpResponse.json({ data: CREATED_INCIDENT }, { status: 201 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/incidents/new']}>
        <Routes>
          <Route path="/incidents/new" element={<CreateIncidentPage />} />
          <Route
            path="/incidents/:id"
            element={<div data-testid="detail-page" />}
          />
          <Route
            path="/incidents"
            element={<div data-testid="list-page" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/title/i), 'Printer not working');
  await userEvent.type(
    screen.getByLabelText(/description/i),
    'The printer on floor 2 is broken.',
  );
  await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Hardware');
  await userEvent.selectOptions(screen.getByLabelText(/priority/i), 'Medium');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateIncidentPage', () => {

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the page heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /create incident/i }),
    ).toBeInTheDocument();
  });

  it('renders all four form fields', () => {
    renderPage();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
  });

  it('renders the Submit Incident button', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /submit incident/i }),
    ).toBeInTheDocument();
  });

  it('renders the Cancel button', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  it('renders the Back to Incidents link button', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /back to incidents/i }),
    ).toBeInTheDocument();
  });

  it('renders all backend category options', () => {
    renderPage();
    const select = screen.getByLabelText(/category/i);
    const options = Array.from((select as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(options).toContain('Hardware');
    expect(options).toContain('Software');
    expect(options).toContain('Network');
    expect(options).toContain('Access_Permissions');
    expect(options).toContain('Email_Communication');
    expect(options).toContain('Other');
  });

  it('renders all four priority options', () => {
    renderPage();
    const select = screen.getByLabelText(/priority/i);
    const options = Array.from((select as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(options).toContain('Low');
    expect(options).toContain('Medium');
    expect(options).toContain('High');
    expect(options).toContain('Critical');
  });

  // ── Client-side validation ────────────────────────────────────────────────

  it('shows a title error when submitted empty', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });

  it('shows a description error when submitted empty', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/title/i), 'Some title');
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));
    expect(await screen.findByText(/description is required/i)).toBeInTheDocument();
  });

  it('shows a category error when not selected', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/title/i), 'Some title');
    await userEvent.type(screen.getByLabelText(/description/i), 'Some description');
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));
    expect(await screen.findByText(/category is required/i)).toBeInTheDocument();
  });

  it('shows a priority error when not selected', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/title/i), 'Some title');
    await userEvent.type(screen.getByLabelText(/description/i), 'Some desc');
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Hardware');
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));
    expect(await screen.findByText(/priority is required/i)).toBeInTheDocument();
  });

  it('shows all four errors simultaneously on empty submit', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));
    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeInTheDocument();
      expect(screen.getByText(/description is required/i)).toBeInTheDocument();
      expect(screen.getByText(/category is required/i)).toBeInTheDocument();
      expect(screen.getByText(/priority is required/i)).toBeInTheDocument();
    });
  });

  it('does not call the API when client validation fails', async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/incidents`, () => {
        called = true;
        return HttpResponse.json({ data: CREATED_INCIDENT }, { status: 201 });
      }),
    );

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    // Brief wait to let any async side-effects settle
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(false);
  });

  it('clears title error as soon as user starts typing', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/title/i), 'a');
    expect(screen.queryByText(/title is required/i)).not.toBeInTheDocument();
  });

  // ── Successful submission ─────────────────────────────────────────────────

  it('disables the submit button while submitting', async () => {
    // Delay the response so we can observe the loading state
    server.use(
      http.post(`${BASE}/incidents`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({ data: CREATED_INCIDENT }, { status: 201 });
      }),
    );

    renderPage();
    await fillValidForm();

    const submitBtn = screen.getByRole('button', { name: /submit incident/i });
    await userEvent.click(submitBtn);

    // Button should be disabled immediately after click
    expect(submitBtn).toBeDisabled();
  });

  it('shows "Submitting…" text while the request is in flight', async () => {
    server.use(
      http.post(`${BASE}/incidents`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({ data: CREATED_INCIDENT }, { status: 201 });
      }),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    expect(await screen.findByText(/submitting/i)).toBeInTheDocument();
  });

  it('sends the correct payload to POST /api/v1/incidents', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/incidents`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: CREATED_INCIDENT }, { status: 201 });
      }),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    await waitFor(() => {
      expect(body).toEqual({
        title: 'Printer not working',
        description: 'The printer on floor 2 is broken.',
        category: 'Hardware',
        priority: 'Medium',
      });
    });
  });

  it('navigates to the created incident detail page on success', async () => {
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument();
    });
  });

  // ── API error handling ────────────────────────────────────────────────────

  it('shows general error message when API returns a 500', async () => {
    server.use(
      http.post(`${BASE}/incidents`, () =>
        HttpResponse.json(
          { message: 'Internal server error' },
          { status: 500 },
        ),
      ),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows field-level validation errors returned from the API', async () => {
    server.use(
      http.post(`${BASE}/incidents`, () =>
        HttpResponse.json(
          {
            error_code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: [
              { field: 'title', message: 'Title must not exceed 200 characters' },
            ],
          },
          { status: 422 },
        ),
      ),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    expect(
      await screen.findByText(/title must not exceed 200 characters/i),
    ).toBeInTheDocument();
  });

  it('re-enables the submit button after a failed request', async () => {
    server.use(
      http.post(`${BASE}/incidents`, () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 }),
      ),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /submit incident/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /submit incident/i }),
      ).not.toBeDisabled();
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it('navigates to /incidents when Cancel is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByTestId('list-page')).toBeInTheDocument();
  });

  it('navigates to /incidents when Back to Incidents is clicked', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /back to incidents/i }),
    );
    expect(screen.getByTestId('list-page')).toBeInTheDocument();
  });
});
