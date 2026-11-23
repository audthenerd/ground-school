/**
 * Detect whether the owner already has the fixed RSAF Commands sortie —
 * either an active generation run or a ready classroom in the library.
 */
import {
  type AssessmentLevel,
  isAssessmentLevel,
  parseAssessmentLevel,
} from '@/lib/ground-school/assessment-level';
import {
  SORTIE_ASSESSMENT_LEVEL_PREFIX,
  SORTIE_REQUIREMENT,
  SORTIE_REQUIREMENT_MARKER,
} from '@/lib/ground-school/sortie-briefing';

/** sessionStorage key: this tab already tried (or skipped) login auto-start. */
export const SORTIE_AUTOSTART_SESSION_KEY = 'ground-school:sortie-autostart';

/** Course titles / descriptions from this sortie include this topic string. */
export const RSAF_COMMANDS_LABEL = /RSAF\s+Commands/i;

export function isSortieRequirement(requirement: string): boolean {
  if (requirement === SORTIE_REQUIREMENT) return true;
  return requirement.includes(SORTIE_REQUIREMENT_MARKER);
}

/** Recover L1/L2/L3 from a sortie requirement string (defaults to L1). */
export function assessmentLevelFromRequirement(requirement: string): AssessmentLevel {
  if (!isSortieRequirement(requirement)) return 'L1';
  const match = requirement.match(
    new RegExp(`${SORTIE_ASSESSMENT_LEVEL_PREFIX}\\s*(L[123])`),
  );
  if (match?.[1] && isAssessmentLevel(match[1])) return match[1];
  // Legacy L1 requirement without an embedded level tag.
  return parseAssessmentLevel('L1');
}

export function hasInProgressSortieRun(
  runs: ReadonlyArray<{ input: { requirement: string } }>,
): boolean {
  return runs.some((run) => isSortieRequirement(run.input.requirement));
}

export function hasReadySortieClassroom(
  classrooms: ReadonlyArray<{ name?: string; description?: string }>,
): boolean {
  return classrooms.some(
    (c) => RSAF_COMMANDS_LABEL.test(c.name ?? '') || RSAF_COMMANDS_LABEL.test(c.description ?? ''),
  );
}

/** True when auto-start should not create another RSAF Commands run. */
export function hasSortiePresence(
  runs: ReadonlyArray<{ input: { requirement: string } }>,
  classrooms: ReadonlyArray<{ name?: string; description?: string }>,
): boolean {
  return hasInProgressSortieRun(runs) || hasReadySortieClassroom(classrooms);
}
