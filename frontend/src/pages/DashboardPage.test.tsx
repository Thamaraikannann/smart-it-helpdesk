/**
 * Tests for DashboardPage
 * Covers: loading, summary cards, status/priority/category counts,
 * average-time metric, API error state, and role/access behaviour.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import type { DashboardMetrics } from '../api/dashboard';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE = '/api/v1';

const FULL_METRICS: DashboardMetrics = {
  total_incidents: 42,
  unassigned_open_count: 7,
  avg_seconds_to_in_progress: 7200,  // 2 hours
  by_status: [
    { status: 'Open', count: 15 },
    { status: 'In_Progress', count: 10 },
    { status: 'On_Hold', count: 5 },
    { status: 'Resolved', count: 8 },
    { status: 'Closed', count: 4 },
  ],
  by_priority: [
    { priority: 'Low', count: 12 },
    { priority: 'Medium', count: 18 },
    { priority: 'High', count: 9 },
    { priority: 'Critical', count: 3 },
  ],
  by_category: [
    { category: 'Hardware', count: 14 },
    { category: 'Software', count: 11 },
    { category: 'Network', count: 8 },
    { category: 'Access_Permissions', count: 5 },
    { category: 'Email_Communication', count: 3 },
    { category: 'Other', count: 1 },
  ],
};

const EMPTY_METRICS: DashboardMetrics = {
  total_incidents: 0,
  unassigned_open_count: 0,
  avg_seconds_to_in_progress: null,
  by_status: [],
  by_priority: [],
  by_category: [],
};

const server = setupServer(
  http.get(`${BASE}/dashboard`, () =>
    HttpResponse.json({ data: FULL_METRICS }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setRole(role: string) {
  localStorage.setItem('auth_user', JSON.stringify({ role }));
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/incidents" element={<div data-testid="incidents-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => setRole('Admin'));
afterEach(() => localStorage.clear());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardPage', () => {

  // ── Loading state ─────────────────────────────────────────────────────────

  it('shows loading skeleton before data arrives', () => {
    server.use(
      http.get(`${BASE}/dashboard`, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({ data: FULL_METRICS });
      }),
    );
    renderPage();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the page heading after data loads', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  // ── Summary cards ─────────────────────────────────────────────────────────

  it('shows Total Incidents card with correct value', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('Total Incidents')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows Unassigned Open card with correct value', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('Unassigned Open')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows Average Time to In Progress card', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('Avg. Time to In Progress')).toBeInTheDocument();
    // 7200 seconds = 2 hours
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('shows "—" for average time when metric is null', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ data: EMPTY_METRICS }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows "No data yet" sub-label when avg is null', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ data: EMPTY_METRICS }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  // ── Format helpers ─────────────────────────────────────────────────────────

  it('formats seconds less than 60 as seconds', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({
          data: { ...FULL_METRICS, avg_seconds_to_in_progress: 45 },
        }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('formats seconds in minutes range', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({
          data: { ...FULL_METRICS, avg_seconds_to_in_progress: 300 },
        }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText('5m')).toBeInTheDocument();
  });

  // ── Status counts ─────────────────────────────────────────────────────────

  it('renders the By Status section heading', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText(/by status/i)).toBeInTheDocument();
  });

  it('renders all status labels with counts', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });

    const statusSection = screen.getByLabelText('Incidents by status');
    expect(statusSection).toBeInTheDocument();

    // Each bar row has an aria-label containing the label and value
    expect(screen.getByRole('meter', { name: /open: 15/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /in progress: 10/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /resolved: 8/i })).toBeInTheDocument();
  });

  it('shows "No data." in By Status when array is empty', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ data: EMPTY_METRICS }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    const noDataElements = screen.getAllByText('No data.');
    expect(noDataElements.length).toBeGreaterThan(0);
  });

  // ── Priority counts ────────────────────────────────────────────────────────

  it('renders the By Priority section heading', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText(/by priority/i)).toBeInTheDocument();
  });

  it('renders all priority labels with counts', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByRole('meter', { name: /low: 12/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /medium: 18/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /high: 9/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /critical: 3/i })).toBeInTheDocument();
  });

  // ── Category counts ────────────────────────────────────────────────────────

  it('renders the By Category section heading', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByText(/by category/i)).toBeInTheDocument();
  });

  it('renders category labels with correct counts', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByRole('meter', { name: /hardware: 14/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /software: 11/i })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /network: 8/i })).toBeInTheDocument();
  });

  it('renders underscored category labels with spaces', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });

    // "Access_Permissions" should display as "Access Permissions"
    expect(screen.getByText('Access Permissions')).toBeInTheDocument();
    expect(screen.getByText('Email Communication')).toBeInTheDocument();
  });

  // ── API error state ────────────────────────────────────────────────────────

  it('shows error message on 500 response', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ message: 'Internal error' }, { status: 500 }),
      ),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /failed to load dashboard data/i,
    );
  });

  it('shows permission error message on 403 response', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission/i);
  });

  it('renders a Back to Incidents button on error', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ message: 'Error' }, { status: 500 }),
      ),
    );
    renderPage();
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: /back to incidents/i }),
    ).toBeInTheDocument();
  });

  it('navigates to /incidents when Back to Incidents is clicked on error', async () => {
    server.use(
      http.get(`${BASE}/dashboard`, () =>
        HttpResponse.json({ message: 'Error' }, { status: 500 }),
      ),
    );
    renderPage();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /back to incidents/i }));
    expect(screen.getByTestId('incidents-page')).toBeInTheDocument();
  });

  // ── Role / access behaviour ───────────────────────────────────────────────

  it('renders dashboard for Admin role', async () => {
    setRole('Admin');
    renderPage();
    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('renders dashboard for Support_Agent role', async () => {
    setRole('Support_Agent');
    renderPage();
    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('shows Access Denied for Employee role', () => {
    setRole('Employee');
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/access denied/i);
  });

  it('does NOT call the API when role is Employee', () => {
    setRole('Employee');
    let called = false;
    server.use(
      http.get(`${BASE}/dashboard`, () => {
        called = true;
        return HttpResponse.json({ data: FULL_METRICS });
      }),
    );
    renderPage();
    // The query is disabled for non-agents — API must not be called
    expect(called).toBe(false);
  });

  it('shows a Go to Incidents button on the Access Denied screen', () => {
    setRole('Employee');
    renderPage();
    expect(
      screen.getByRole('button', { name: /go to incidents/i }),
    ).toBeInTheDocument();
  });

  it('navigates to /incidents when Go to Incidents is clicked', async () => {
    setRole('Employee');
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /go to incidents/i }));
    expect(screen.getByTestId('incidents-page')).toBeInTheDocument();
  });

  it('shows Access Denied for unknown/empty role', () => {
    localStorage.setItem('auth_user', JSON.stringify({ role: '' }));
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/access denied/i);
  });
});
