import { describe, expect, it } from 'vitest';

import { CURRICULUM_SLOT_RSAF_COMMANDS } from '@/lib/persistence/curriculum';
import { SORTIE_REQUIREMENT } from '@/lib/ground-school/sortie-briefing';

describe('curriculum slot', () => {
  it('uses the fixed rsaf-commands slot for the shared classroom', () => {
    expect(CURRICULUM_SLOT_RSAF_COMMANDS).toBe('rsaf-commands');
  });

  it('still keys generation on the fixed sortie requirement text', () => {
    expect(SORTIE_REQUIREMENT).toContain('RSAF Commands');
  });

  it('requires the fixed 9+1+20 classroom shape in the sortie requirement', () => {
    expect(SORTIE_REQUIREMENT).toContain('Exactly nine type "slide"');
    expect(SORTIE_REQUIREMENT).toContain('Exactly one type "interactive"');
    expect(SORTIE_REQUIREMENT).toContain('questionCount: 20');
  });
});
