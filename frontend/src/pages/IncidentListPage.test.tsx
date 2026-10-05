/**
 * Unit/integration tests for IncidentListPage
 *
 * Uses MSW to intercept API calls so no real backend is needed.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import IncidentListPage from './IncidentListPage';
import type { IncidentListResponse } from '../api/incidents';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE = '/api/v1';

function makeIncident(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-0000-0000-0000-000000000001',
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
    ...overrides,
  };
}

function makeResponse(
  incidents: ReturnType<typeof makeIncident>[],
  page = 1,
  total = incidents.length,
): IncidentListResponse {
  return {
    data: incidents as unknown as IncidentListResponse['data'],
    pagination: {
      total_count: total,
      page,
      page_size: 20,
      total_pages: Math.ceil(total / 20) || 0,
    },
  };
}

const server = setupServer(
  http.get(`${BASE}/incidents`, () => {
    return HttpResponse.json(makeResponse([makeIncident()]));
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderPage() {
  // Fresh QueryClient per test to avoid cache pollution
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/incidents']}>
        <Routes>
          <Route path="/incidents" element={<IncidentListPage />} />
          <Route path="/incidents/:id" element={<div data-testid="detail-page" />} />
          <Route path="/incidents/new" element={<div data-testid="new-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncidentListPage', () => {

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the page heading', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /incidents/i })).toBeInTheDocument();
  });

  it('renders the Create Incident button', async () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /create incident/i }),
    ).toBeInTheDocument();
  });

  it('renders filter controls', async () => {
    renderPage();
    expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by priority/i)).toBeInTheDocument();
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  it('shows loading skeleton rows initially', () => {
    // Use a delayed handler so loading state is visible
    server.use(
      http.get(`${BASE}/incidents`, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json(makeResponse([]));
      }),
    );

    renderPage();
    // Loading rows use animate-pulse divs inside td elements
    const cells = document.querySelectorAll('td');
    expect(cells.length).toBeGreaterThan(0);
  });

  // ── Data rendering ────────────────────────────────────────────────────────

  it('displays incident data after loading', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Printer not working')).toBeInTheDocument();
    });

    // Query within the table row to avoid matching <option> elements in filter selects
    const row = screen.getByRole('row', { name: /view incident printer not working/i });
    expect(within(row).getByText('Hardware')).toBeInTheDocument();
    expect(within(row).getByText('Medium')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
  });

  it('shows a short ID in monospace', async () => {
    renderPage();

    await waitFor(() => {
      // shortId() returns first 8 chars uppercase
      expect(screen.getByText('11111111')).toBeInTheDocument();
    });
  });

  it('renders formatted created date', async () => {
    renderPage();

    await waitFor(() => {
      // The date "2024-03-01" should appear in some locale format
      const dateCell = screen.getByText(/mar/i);
      expect(dateCell).toBeInTheDocument();
    });
  });

  it('shows "—" when incident is unassigned', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('displays total incident count in the header', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/1 incident total/i)).toBeInTheDocument();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('shows empty state message when no incidents are returned', async () => {
    server.use(
      http.get(`${BASE}/incidents`, () =>
        HttpResponse.json(makeResponse([])),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no incidents yet/i)).toBeInTheDocument();
    });
  });

  it('shows filtered empty state message when filters are active', async () => {
    server.use(
      http.get(`${BASE}/incidents`, () =>
        HttpResponse.json(makeResponse([])),
      ),
    );

    renderPage();

    const statusSelect = screen.getByLabelText(/filter by status/i);
    await userEvent.selectOptions(statusSelect, 'Closed');

    await waitFor(() => {
      expect(
        screen.getByText(/no incidents match your filters/i),
      ).toBeInTheDocument();
    });
  });

  // ── Error state ───────────────────────────────────────────────────────────

  it('shows error message on API failure', async () => {
    server.use(
      http.get(`${BASE}/incidents`, () =>
        HttpResponse.json(
          { message: 'Internal server error' },
          { status: 500 },
        ),
      ),
    );

    renderPage();

    await waitFor(() => {
      // When the API returns a message, it is shown directly;
      // when no message is available the fallback text is used.
      const errorEl =
        screen.queryByText(/internal server error/i) ??
        screen.queryByText(/failed to load incidents/i);
      expect(errorEl).toBeInTheDocument();
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it('navigates to incident detail when row is clicked', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Printer not working')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Printer not working'));

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument();
    });
  });

  it('navigates to /incidents/new when Create Incident is clicked', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create incident/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /create incident/i }));

    await waitFor(() => {
      expect(screen.getByTestId('new-page')).toBeInTheDocument();
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it('sends search query param when Search button is clicked', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/incidents`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeResponse([]));
      }),
    );

    renderPage();

    const searchInput = screen.getByLabelText(/search incidents/i);
    await userEvent.type(searchInput, 'printer');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => {
      expect(capturedUrl).toContain('search=printer');
    });
  });

  it('sends search query param when Enter is pressed', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/incidents`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeResponse([]));
      }),
    );

    renderPage();

    const searchInput = screen.getByLabelText(/search incidents/i);
    await userEvent.type(searchInput, 'network{Enter}');

    await waitFor(() => {
      expect(capturedUrl).toContain('search=network');
    });
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  it('sends status filter as query param', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/incidents`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeResponse([]));
      }),
    );

    renderPage();

    const statusSelect = screen.getByLabelText(/filter by status/i);
    await userEvent.selectOptions(statusSelect, 'Open');

    await waitFor(() => {
      expect(capturedUrl).toContain('status=Open');
    });
  });

  it('sends priority filter as query param', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/incidents`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeResponse([]));
      }),
    );

    renderPage();

    const prioritySelect = screen.getByLabelText(/filter by priority/i);
    await userEvent.selectOptions(prioritySelect, 'High');

    await waitFor(() => {
      expect(capturedUrl).toContain('priority=High');
    });
  });

  it('shows Clear filters button when a filter is active', async () => {
    renderPage();

    const statusSelect = screen.getByLabelText(/filter by status/i);
    await userEvent.selectOptions(statusSelect, 'Open');

    expect(
      screen.getByRole('button', { name: /clear all filters/i }),
    ).toBeInTheDocument();
  });

  it('hides Clear filters button when no filters are active', async () => {
    renderPage();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Printer not working')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /clear all filters/i }),
    ).not.toBeInTheDocument();
  });

  it('clears all filters when Clear filters is clicked', async () => {
    renderPage();

    const statusSelect = screen.getByLabelText(/filter by status/i);
    await userEvent.selectOptions(statusSelect, 'Open');

    const clearBtn = await screen.findByRole('button', { name: /clear all filters/i });
    await userEvent.click(clearBtn);

    expect(
      screen.queryByRole('button', { name: /clear all filters/i }),
    ).not.toBeInTheDocument();
    expect((statusSelect as HTMLSelectElement).value).toBe('');
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('renders pagination when total_pages > 0', async () => {
    server.use(
      http.get(`${BASE}/incidents`, () =>
        HttpResponse.json(makeResponse([makeIncident()], 1, 25)),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/next page/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/previous page/i)).toBeInTheDocument();
    });
  });

  it('disables Prev button on first page', async () => {
    renderPage();

    await waitFor(() => {
      const prevBtn = screen.getByLabelText(/previous page/i);
      expect(prevBtn).toBeDisabled();
    });
  });

  it('disables Next button on last page', async () => {
    server.use(
      http.get(`${BASE}/incidents`, () =>
        HttpResponse.json(makeResponse([makeIncident()], 1, 1)),
      ),
    );

    renderPage();

    await waitFor(() => {
      const nextBtn = screen.getByLabelText(/next page/i);
      expect(nextBtn).toBeDisabled();
    });
  });

  it('requests page 2 when Next is clicked', async () => {
    const pages: number[] = [];
    server.use(
      http.get(`${BASE}/incidents`, ({ request }) => {
        const url = new URL(request.url);
        pages.push(Number(url.searchParams.get('page') ?? '1'));
        return HttpResponse.json(makeResponse([makeIncident()], 1, 25));
      }),
    );

    renderPage();

    const nextBtn = await screen.findByLabelText(/next page/i);
    await userEvent.click(nextBtn);

    await waitFor(() => {
      expect(pages).toContain(2);
    });
  });
});
