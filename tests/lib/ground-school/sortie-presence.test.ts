import { describe, expect, it } from 'vitest';

import { SORTIE_REQUIREMENT } from '@/lib/ground-school/sortie-briefing';
import {
  hasInProgressSortieRun,
  hasReadySortieClassroom,
  hasSortiePresence,
  isSortieRequirement,
} from '@/lib/ground-school/sortie-presence';

describe('sortie presence', () => {
  it('matches only the fixed SORTIE_REQUIREMENT text', () => {
    expect(isSortieRequirement(SORTIE_REQUIREMENT)).toBe(true);
    expect(isSortieRequirement('RSAF Commands')).toBe(false);
  });

  it('detects an in-progress sortie run by requirement', () => {
    expect(
      hasInProgressSortieRun([{ input: { requirement: SORTIE_REQUIREMENT } }]),
    ).toBe(true);
    expect(hasInProgressSortieRun([{ input: { requirement: 'other topic' } }])).toBe(false);
    expect(hasInProgressSortieRun([])).toBe(false);
  });

  it('detects a ready classroom by RSAF Commands in name or description', () => {
    expect(hasReadySortieClassroom([{ name: 'RSAF Commands overview' }])).toBe(true);
    expect(hasReadySortieClassroom([{ name: 'Lesson', description: 'RSAF Commands' }])).toBe(
      true,
    );
    expect(hasReadySortieClassroom([{ name: 'Imported workshop' }])).toBe(false);
  });

  it('combines run and classroom presence', () => {
    expect(hasSortiePresence([], [])).toBe(false);
    expect(
      hasSortiePresence([{ input: { requirement: SORTIE_REQUIREMENT } }], []),
    ).toBe(true);
    expect(hasSortiePresence([], [{ name: 'RSAF Commands' }])).toBe(true);
  });
});
