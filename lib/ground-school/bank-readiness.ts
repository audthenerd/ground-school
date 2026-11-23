/**
 * Server-only: count question-bank items available per assessment level.
 * Kept separate from assessment-level.ts so client bundles (home / sortie
 * briefing) never pull Node `fs` via question-bank.json.
 */
import {
  ASSESSMENT_LEVELS,
  ASSESSMENT_LEVEL_BLOOMS,
  BLOOMS_LEVELS,
  type AssessmentLevel,
  type BloomsLevel,
} from '@/lib/ground-school/assessment-level';
import { DEFAULT_SORTIE_TOPICS, filterQuestionBank } from '@/lib/ground-school/question-bank';

export interface BankReadinessLevelCounts {
  level: AssessmentLevel;
  requiredBlooms: readonly BloomsLevel[];
  availableByBloom: Record<BloomsLevel, number>;
  availableTotal: number;
  /** Ideal quiz size for this level (20). */
  targetCount: number;
  ready: boolean;
}

/** Count RSAF Commands (or given topics) bank items that match each level’s Blooms. */
export function bankReadinessForLevels(
  topics: readonly string[] = DEFAULT_SORTIE_TOPICS,
  targetCount = 20,
): BankReadinessLevelCounts[] {
  const pool = filterQuestionBank(topics);
  return ASSESSMENT_LEVELS.map((level) => {
    const required = ASSESSMENT_LEVEL_BLOOMS[level];
    const availableByBloom = Object.fromEntries(
      BLOOMS_LEVELS.map((bloom) => [bloom, 0]),
    ) as Record<BloomsLevel, number>;
    let availableTotal = 0;
    for (const item of pool) {
      if (!item.bloomsLevel || !required.includes(item.bloomsLevel)) continue;
      availableByBloom[item.bloomsLevel] += 1;
      availableTotal += 1;
    }
    return {
      level,
      requiredBlooms: required,
      availableByBloom,
      availableTotal,
      targetCount,
      ready: availableTotal >= targetCount,
    };
  });
}
