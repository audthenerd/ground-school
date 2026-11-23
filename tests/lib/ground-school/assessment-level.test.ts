import { describe, expect, it } from 'vitest';

import {
  ASSESSMENT_LEVELS,
  bloomsForAssessmentLevel,
  buildProbePackContent,
  hasProbePack,
  quizDistributionForLevel,
} from '@/lib/ground-school/assessment-level';
import {
  assessmentLevelFromRequirement,
  isSortieRequirement,
} from '@/lib/ground-school/sortie-presence';
import { buildSortieRequirement, SORTIE_REQUIREMENT } from '@/lib/ground-school/sortie-briefing';
import {
  isSortieOutlineShape,
  normalizeSortieOutlines,
} from '@/lib/ground-school/classroom-format';
import { sampleBankItemsForQuiz } from '@/lib/ground-school/question-bank-quiz';
import type { SceneOutline } from '@/lib/types/generation';

describe('assessment levels', () => {
  it('maps Bloom bands per level', () => {
    expect(bloomsForAssessmentLevel('L1')).toEqual(['remember', 'understand']);
    expect(bloomsForAssessmentLevel('L2')).toEqual(['apply', 'analyze']);
    expect(bloomsForAssessmentLevel('L3')).toEqual(['evaluate', 'create']);
  });

  it('builds L2/L3 probe packs with E·M·I', () => {
    for (const level of ['L2', 'L3'] as const) {
      const pack = buildProbePackContent(level);
      expect(pack.type).toBe('probe_pack');
      expect(pack.assessmentLevel).toBe(level);
      expect(pack.probes.map((p) => p.dimension)).toEqual(['E', 'M', 'I']);
      expect(hasProbePack(level)).toBe(true);
    }
    expect(hasProbePack('L1')).toBe(false);
  });

  it('embeds assessment level in sortie requirements', () => {
    for (const level of ASSESSMENT_LEVELS) {
      const req = buildSortieRequirement(level);
      expect(isSortieRequirement(req)).toBe(true);
      expect(assessmentLevelFromRequirement(req)).toBe(level);
    }
    expect(isSortieRequirement(SORTIE_REQUIREMENT)).toBe(true);
    expect(assessmentLevelFromRequirement(SORTIE_REQUIREMENT)).toBe('L1');
  });
});

describe('normalizeSortieOutlines by level', () => {
  function slide(id: string, order: number): SceneOutline {
    return {
      id,
      type: 'slide',
      title: id,
      description: 'desc',
      keyPoints: ['a', 'b', 'c'],
      order,
    };
  }

  it('keeps L1 as 9+1+1 quiz terminal', () => {
    const normalized = normalizeSortieOutlines([slide('s1', 1)], 'L1');
    expect(isSortieOutlineShape(normalized, 'L1')).toBe(true);
    expect(normalized.filter((o) => o.type === 'slide')).toHaveLength(9);
    expect(normalized.at(-1)?.type).toBe('quiz');
    expect(normalized.at(-1)?.title.toLowerCase()).not.toContain('practice');
  });

  it('shapes L2 as 8+1+practice quiz+probe pack', () => {
    const normalized = normalizeSortieOutlines([slide('s1', 1)], 'L2');
    expect(isSortieOutlineShape(normalized, 'L2')).toBe(true);
    expect(normalized.filter((o) => o.type === 'slide')).toHaveLength(8);
    expect(normalized[8]?.type).toBe('interactive');
    expect(normalized[9]?.type).toBe('quiz');
    expect(normalized[9]?.title.toLowerCase()).toContain('practice');
    expect(normalized[10]?.type).toBe('probe_pack');
  });
});

describe('level-scoped quiz sampling', () => {
  it('does not overflow L1 quizzes into apply/analyze', () => {
    const items = sampleBankItemsForQuiz({
      seed: 'l1-no-overflow',
      count: 20,
      bloomsDistribution: quizDistributionForLevel('L1'),
      allowOverflow: false,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every(
        (item) =>
          item.bloomsLevel === 'remember' ||
          item.bloomsLevel === 'understand' ||
          item.bloomsLevel === null,
      ),
    ).toBe(true);
    // With allowOverflow false, unclassified should also be excluded from fill
    expect(items.every((item) => item.bloomsLevel === 'remember' || item.bloomsLevel === 'understand')).toBe(
      true,
    );
  });
});
