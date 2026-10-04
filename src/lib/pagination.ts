/**
 * Pagination envelope returned in all list responses (Requirement 13.3).
 * Matches the API contract documented in the design:
 *   { total_count, page, page_size, total_pages }
 */
export interface PaginationEnvelope {
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Build a pagination envelope from the raw counts and page parameters.
 *
 * Edge-case handling:
 * - total_count === 0 → total_pages is 0 (not NaN)
 * - page_size <= 0   → total_pages is 0 (guard against divide-by-zero)
 */
export function buildPaginationEnvelope(
  total_count: number,
  page: number,
  page_size: number,
): PaginationEnvelope {
  let total_pages: number;

  if (page_size <= 0 || total_count === 0) {
    total_pages = 0;
  } else {
    total_pages = Math.ceil(total_count / page_size);
  }

  return { total_count, page, page_size, total_pages };
}
