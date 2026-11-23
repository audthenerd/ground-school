/**
 * OQ assessment levels (L1–L3) and their Bloom / probe mappings.
 *
 * Client-safe: no Node `fs` / question-bank imports. Bank readiness lives in
 * `bank-readiness.ts` (server-only).
 *
 * L1 = Immersed questionnaire (certifying bank quiz).
 * L2/L3 = Capable / Lead-Capable prep: practice quiz + F2F assessor probe pack.
 * Probe packs store interview evidence only — they do not award standing.
 */
import type { ProbePackContent } from '@/lib/types/stage';

/** Bloom levels (mirrors question-bank; kept local so this module stays client-safe). */
export const BLOOMS_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const;
export type BloomsLevel = (typeof BLOOMS_LEVELS)[number];

export type BloomsDistribution = Partial<Record<BloomsLevel, number>>;

export const ASSESSMENT_LEVELS = ['L1', 'L2', 'L3'] as const;
export type AssessmentLevel = (typeof ASSESSMENT_LEVELS)[number];

export const OQ_DIMENSIONS = ['E', 'M', 'I'] as const;
export type OqDimension = (typeof OQ_DIMENSIONS)[number];

export const ASSESSMENT_LEVEL_LABELS: Record<AssessmentLevel, string> = {
  L1: 'Immersed',
  L2: 'Capable',
  L3: 'Lead-Capable',
};

export const ASSESSMENT_LEVEL_BLOOMS: Record<AssessmentLevel, readonly BloomsLevel[]> = {
  L1: ['remember', 'understand'],
  L2: ['apply', 'analyze'],
  L3: ['evaluate', 'create'],
};

/** Target quiz mix by level (percentages; sampler normalizes to question count). */
export const ASSESSMENT_LEVEL_QUIZ_DISTRIBUTION: Record<AssessmentLevel, BloomsDistribution> = {
  L1: { remember: 40, understand: 60, apply: 0, analyze: 0, evaluate: 0, create: 0 },
  L2: { remember: 0, understand: 0, apply: 50, analyze: 50, evaluate: 0, create: 0 },
  L3: { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 50, create: 50 },
};

export const PROBE_PACK_BANNER =
  'Assessor instrument for F2F. Completing this pack does not award Capable / Lead-Capable.';

export interface ProbeTemplate {
  dimension: OqDimension;
  bloomsLevel: BloomsLevel;
  title: string;
  /** Canonical assessor prompt; generation may ground this in classroom material. */
  stem: string;
  goodLooksLike: string;
  notesForAssessor?: string;
}

export interface ProbeItem extends ProbeTemplate {
  id: string;
}

const L2_PROBES: readonly ProbeTemplate[] = [
  {
    dimension: 'E',
    bloomsLevel: 'analyze',
    title: 'Back-brief probe',
    stem: 'Who is the user, what decision are they making, what constraints bind them, and what threat or failure mode matters most?',
    goodLooksLike:
      'Unprompted and correct: names the user, the decision, the constraints, and the threat without being led.',
    notesForAssessor: 'Operational empathy (E) — Apply · Analyse.',
  },
  {
    dimension: 'M',
    bloomsLevel: 'apply',
    title: 'Inject probe',
    stem: 'Mid-scenario the panel changes a constraint or priority. What is the new intent, what do you drop first, and how do you hold tempo?',
    goodLooksLike:
      'Reads the new intent quickly, holds tempo, and states what matters most under the changed pressure.',
    notesForAssessor: 'Warfighter mindset (M) — Apply · Analyse.',
  },
  {
    dimension: 'I',
    bloomsLevel: 'analyze',
    title: 'Build probe',
    stem: 'What would you build instead of what was asked, and why would the unit adopt it?',
    goodLooksLike:
      'A better-than-asked answer grounded in the unit’s real adoption constraints — not a generic feature list.',
    notesForAssessor: 'Innovation & design (I) — Apply · Analyse.',
  },
];

const L3_PROBES: readonly ProbeTemplate[] = [
  {
    dimension: 'E',
    bloomsLevel: 'evaluate',
    title: 'Critique probe',
    stem: 'Where is the current ops flow wrong, and what would you change in the doctrine?',
    goodLooksLike: 'Defensible judgement: pinpoints a real flow failure and a doctrine-level change.',
    notesForAssessor: 'Operational empathy (E) — Evaluate.',
  },
  {
    dimension: 'M',
    bloomsLevel: 'create',
    title: 'Design-the-inject probe',
    stem: 'Design the inject you would use to test a junior team’s mindset.',
    goodLooksLike:
      'A concrete inject that stresses intent-reading under pressure — not a trivia quiz.',
    notesForAssessor: 'Warfighter mindset (M) — Create.',
  },
  {
    dimension: 'I',
    bloomsLevel: 'create',
    title: 'Adoption probe',
    stem: 'What did the route produce, and would the unit adopt it? On what evidence?',
    goodLooksLike:
      'Judges the outcome by adoption, not by cleverness of the design alone.',
    notesForAssessor: 'Innovation & design (I) — Create.',
  },
];

export function isAssessmentLevel(value: unknown): value is AssessmentLevel {
  return typeof value === 'string' && (ASSESSMENT_LEVELS as readonly string[]).includes(value);
}

export function parseAssessmentLevel(
  value: unknown,
  fallback: AssessmentLevel = 'L1',
): AssessmentLevel {
  return isAssessmentLevel(value) ? value : fallback;
}

export function bloomsForAssessmentLevel(level: AssessmentLevel): readonly BloomsLevel[] {
  return ASSESSMENT_LEVEL_BLOOMS[level];
}

export function quizDistributionForLevel(level: AssessmentLevel): BloomsDistribution {
  return { ...ASSESSMENT_LEVEL_QUIZ_DISTRIBUTION[level] };
}

export function hasProbePack(level: AssessmentLevel): level is 'L2' | 'L3' {
  return level === 'L2' || level === 'L3';
}

export function probeTemplatesForLevel(level: 'L2' | 'L3'): readonly ProbeTemplate[] {
  return level === 'L2' ? L2_PROBES : L3_PROBES;
}

/** Build a grounded probe pack from templates (no invented unit facts). */
export function buildProbePackContent(level: 'L2' | 'L3'): ProbePackContent {
  const templates = probeTemplatesForLevel(level);
  const probes = templates.map((template, index) => ({
    ...template,
    id: `probe_${level.toLowerCase()}_${template.dimension.toLowerCase()}_${index + 1}`,
  }));

  return {
    type: 'probe_pack',
    assessmentLevel: level,
    banner: PROBE_PACK_BANNER,
    probes,
  };
}

export function assessmentLevelHelperText(level: AssessmentLevel): string {
  switch (level) {
    case 'L1':
      return 'Teach Remember/Understand. Terminal quiz is the certifying L1 questionnaire (bank items).';
    case 'L2':
      return 'Teach Apply/Analyse. Practice quiz + assessor probe pack (E back-brief, M inject, I build). F2F still certifies.';
    case 'L3':
      return 'Teach Evaluate/Create. Practice quiz + assessor probe pack (E critique, M design-inject, I adoption). F2F still certifies.';
  }
}
