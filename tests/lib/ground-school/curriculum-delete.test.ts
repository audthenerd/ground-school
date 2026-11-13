import { describe, expect, it } from 'vitest';

import { CurriculumDeleteError } from '@/lib/persistence/curriculum';

describe('CurriculumDeleteError', () => {
  it('carries a not_found code', () => {
    const error = new CurriculumDeleteError('not_found', 'Candidate not found');
    expect(error.code).toBe('not_found');
    expect(error.name).toBe('CurriculumDeleteError');
  });
});
