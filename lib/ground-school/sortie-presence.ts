/**
 * Detect whether the owner already has the fixed RSAF Commands sortie —
 * either an active generation run or a ready classroom in the library.
 */
import { SORTIE_REQUIREMENT } from '@/lib/ground-school/sortie-briefing';

/** sessionStorage key: this tab already tried (or skipped) login auto-start. */
export const SORTIE_AUTOSTART_SESSION_KEY = 'ground-school:sortie-autostart';

/** Course titles / descriptions from this sortie include this topic string. */
export const RSAF_COMMANDS_LABEL = /RSAF\s+Commands/i;

export function isSortieRequirement(requirement: string): boolean {
  return requirement === SORTIE_REQUIREMENT;
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
