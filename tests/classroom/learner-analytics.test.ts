import { describe, expect, it } from 'vitest';

import { mintVisitId } from '@/lib/classroom/learner-analytics';

describe('mintVisitId', () => {
  it('returns a non-empty string', () => {
    expect(mintVisitId().length).toBeGreaterThan(8);
  });

  it('returns distinct ids', () => {
    expect(mintVisitId()).not.toBe(mintVisitId());
  });
});
