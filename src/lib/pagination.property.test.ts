import fc from 'fast-check';
import { buildPaginationEnvelope } from './pagination';

describe('buildPaginationEnvelope — property-based tests', () => {
  it('total_pages is always the ceiling of total_count / page_size for positive values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (totalCount, pageSize) => {
          const result = buildPaginationEnvelope(totalCount, 1, pageSize);

          expect(result.total_pages).toBe(
            Math.ceil(totalCount / pageSize),
          );
        },
      ),
    );
  });

  it('total_pages is always zero when total_count is zero', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        (pageSize) => {
          const result = buildPaginationEnvelope(0, 1, pageSize);

          expect(result.total_pages).toBe(0);
        },
      ),
    );
  });

  it('total_pages is always zero when page_size is zero or negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: -100, max: 0 }),
        (totalCount, pageSize) => {
          const result = buildPaginationEnvelope(
            totalCount,
            1,
            pageSize,
          );

          expect(result.total_pages).toBe(0);
        },
      ),
    );
  });
});