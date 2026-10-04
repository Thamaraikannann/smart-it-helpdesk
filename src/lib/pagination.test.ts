import { buildPaginationEnvelope } from './pagination';

describe('buildPaginationEnvelope', () => {
  it('returns correct values for a typical paginated result', () => {
    const result = buildPaginationEnvelope(42, 1, 20);
    expect(result).toEqual({
      total_count: 42,
      page: 1,
      page_size: 20,
      total_pages: 3, // ceil(42/20) = 3
    });
  });

  it('returns total_pages = 0 when total_count is 0', () => {
    const result = buildPaginationEnvelope(0, 1, 20);
    expect(result.total_pages).toBe(0);
    expect(result.total_count).toBe(0);
  });

  it('returns total_pages = 0 when page_size is 0 (guard against divide-by-zero)', () => {
    const result = buildPaginationEnvelope(100, 1, 0);
    expect(result.total_pages).toBe(0);
  });

  it('returns total_pages = 0 when page_size is negative', () => {
    const result = buildPaginationEnvelope(100, 1, -1);
    expect(result.total_pages).toBe(0);
  });

  it('rounds up partial pages correctly', () => {
    // 21 items at page_size 20 → 2 pages
    expect(buildPaginationEnvelope(21, 1, 20).total_pages).toBe(2);
    // 20 items at page_size 20 → 1 page (exact)
    expect(buildPaginationEnvelope(20, 1, 20).total_pages).toBe(1);
    // 1 item at page_size 20 → 1 page
    expect(buildPaginationEnvelope(1, 1, 20).total_pages).toBe(1);
  });

  it('preserves the page and page_size values in the envelope', () => {
    const result = buildPaginationEnvelope(100, 5, 10);
    expect(result.page).toBe(5);
    expect(result.page_size).toBe(10);
  });

  it('handles a large dataset correctly', () => {
    const result = buildPaginationEnvelope(10000, 2, 100);
    expect(result.total_pages).toBe(100);
    expect(result.total_count).toBe(10000);
  });

  it('handles page_size exactly equal to total_count (one full page)', () => {
    const result = buildPaginationEnvelope(50, 1, 50);
    expect(result.total_pages).toBe(1);
  });

  it('total_pages is never NaN or Infinity', () => {
    const cases = [
      buildPaginationEnvelope(0, 1, 0),
      buildPaginationEnvelope(0, 1, 20),
      buildPaginationEnvelope(5, 1, 0),
    ];
    for (const c of cases) {
      expect(Number.isFinite(c.total_pages) || c.total_pages === 0).toBe(true);
      expect(Number.isNaN(c.total_pages)).toBe(false);
    }
  });
});
