/**
 * Fixed Ground School classroom shape by assessment level.
 *
 * L1: 9 slides + 1 interactive + 1 certifying quiz (20 Qs).
 * L2/L3: 8 slides + 1 interactive + 1 practice quiz + 1 probe pack.
 *
 * Outline prompts ask for this; {@link normalizeSortieOutlines} repairs near-misses
 * so curriculum/sortie runs stay on contract.
 */
import {
  type AssessmentLevel,
  hasProbePack,
} from '@/lib/ground-school/assessment-level';
import type { SceneOutline } from '@/lib/types/generation';

export const SORTIE_SLIDE_COUNT_L1 = 9;
export const SORTIE_SLIDE_COUNT_L2_L3 = 8;
/** @deprecated Prefer level-aware slide counts; kept for L1 callers. */
export const SORTIE_SLIDE_COUNT = SORTIE_SLIDE_COUNT_L1;
export const SORTIE_INTERACTIVE_COUNT = 1;
export const SORTIE_QUIZ_COUNT = 1;
export const SORTIE_PROBE_PACK_COUNT = 1;
export const SORTIE_QUIZ_QUESTION_COUNT = 20;
/** L1 total (9+1+1). L2/L3 also total 11 (8+1+1+1). */
export const SORTIE_TOTAL_SCENES = 11;

const DEFAULT_QUIZ_CONFIG: NonNullable<SceneOutline['quizConfig']> = {
  questionCount: SORTIE_QUIZ_QUESTION_COUNT,
  difficulty: 'medium',
  questionTypes: ['single', 'multiple'],
};

const DEFAULT_INTERACTIVE: Pick<SceneOutline, 'widgetType' | 'widgetOutline'> = {
  widgetType: 'diagram',
  widgetOutline: {
    concept: 'RSAF Commands relationships',
    diagramType: 'hierarchy',
  },
};

export function slideCountForLevel(level: AssessmentLevel): number {
  return hasProbePack(level) ? SORTIE_SLIDE_COUNT_L2_L3 : SORTIE_SLIDE_COUNT_L1;
}

function asSlide(outline: SceneOutline, order: number): SceneOutline {
  const next: SceneOutline = {
    ...outline,
    type: 'slide',
    order,
  };
  delete next.quizConfig;
  delete next.widgetType;
  delete next.widgetOutline;
  delete next.interactiveConfig;
  delete next.pblConfig;
  delete next.probePackConfig;
  return next;
}

function asInteractive(outline: SceneOutline, order: number): SceneOutline {
  const next: SceneOutline = {
    ...outline,
    type: 'interactive',
    order,
    widgetType: outline.widgetType ?? DEFAULT_INTERACTIVE.widgetType,
    widgetOutline: outline.widgetOutline ?? DEFAULT_INTERACTIVE.widgetOutline,
  };
  delete next.quizConfig;
  delete next.pblConfig;
  delete next.probePackConfig;
  return next;
}

function quizTitle(raw: string | undefined, level: AssessmentLevel): string {
  if (hasProbePack(level)) {
    const cleaned = (raw ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned && /practice/i.test(cleaned)) return cleaned;
    return 'RSAF Commands Practice Quiz';
  }
  const cleaned = (raw ?? '')
    .trim()
    .replace(/\bpractice\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'RSAF Commands Quiz';
}

function asQuiz(outline: SceneOutline, order: number, level: AssessmentLevel): SceneOutline {
  const practice = hasProbePack(level);
  const next: SceneOutline = {
    ...outline,
    type: 'quiz',
    order,
    title: quizTitle(outline.title, level),
    description: practice
      ? outline.description?.trim() ||
        'Practice quiz for interview prep — does not certify Capable / Lead-Capable.'
      : outline.description
          ?.trim()
          .replace(/\bpractice\b/gi, 'assessment')
          .trim() || 'Quiz: twenty questions from the RSAF Commands question bank.',
    keyPoints: practice
      ? outline.keyPoints?.length > 0
        ? outline.keyPoints
        : ['Practice', 'Interview prep', 'Not a standing change']
      : outline.keyPoints?.length > 0
        ? outline.keyPoints.map((point) => point.replace(/\bpractice\b/gi, 'quiz'))
        : ['Assessment', 'Bank items', 'Facts taught in this lesson'],
    quizConfig: {
      ...DEFAULT_QUIZ_CONFIG,
      ...(outline.quizConfig ?? {}),
      questionCount: SORTIE_QUIZ_QUESTION_COUNT,
    },
  };
  delete next.widgetType;
  delete next.widgetOutline;
  delete next.interactiveConfig;
  delete next.pblConfig;
  delete next.probePackConfig;
  return next;
}

function asProbePack(outline: SceneOutline | undefined, order: number, level: 'L2' | 'L3'): SceneOutline {
  const source = outline ?? {
    id: 'scene_probe_pack_pad',
    type: 'probe_pack' as const,
    title: level === 'L2' ? 'L2 Assessor Probe Pack' : 'L3 Assessor Probe Pack',
    description:
      'Assessor instrument for F2F. Completing this pack does not award Capable / Lead-Capable.',
    keyPoints: ['E', 'M', 'I', 'Interview evidence'],
    order,
  };
  return {
    ...source,
    type: 'probe_pack',
    order,
    title:
      source.title?.trim() ||
      (level === 'L2' ? 'L2 Assessor Probe Pack' : 'L3 Assessor Probe Pack'),
    description:
      source.description?.trim() ||
      'Assessor instrument for F2F. Completing this pack does not award Capable / Lead-Capable.',
    keyPoints:
      source.keyPoints?.length > 0
        ? source.keyPoints
        : ['E', 'M', 'I', 'Interview evidence'],
    probePackConfig: {
      assessmentLevel: level,
      ...(source.probePackConfig ?? {}),
    },
  };
}

function padSlide(order: number, index: number): SceneOutline {
  return {
    id: `scene_slide_pad_${index}`,
    type: 'slide',
    title: `Commands foundation ${index}`,
    description: 'Teach remaining RSAF Commands bank facts for this sortie.',
    keyPoints: ['Bank facts', 'Command distinctions', 'Unlock question IDs'],
    order,
  };
}

function padInteractive(order: number, level: AssessmentLevel): SceneOutline {
  const applyHeavy = hasProbePack(level);
  return asInteractive(
    {
      id: 'scene_interactive_pad',
      type: 'interactive',
      title: applyHeavy
        ? 'Scenario: match the need under constraint'
        : 'Apply: match the need to the command',
      description: applyHeavy
        ? 'Interactive Apply/Analyse page for interview prep.'
        : 'Interactive Apply/Analyse page: the Trainee matches a stated need to the right command or group.',
      keyPoints: applyHeavy
        ? ['Apply', 'Analyse', 'Scenario']
        : ['Apply', 'Analyse', 'ADOC vs APGC'],
      order,
      ...DEFAULT_INTERACTIVE,
    },
    order,
  );
}

function padQuiz(order: number, level: AssessmentLevel): SceneOutline {
  return asQuiz(
    {
      id: 'scene_quiz_pad',
      type: 'quiz',
      title: hasProbePack(level) ? 'RSAF Commands Practice Quiz' : 'RSAF Commands Quiz',
      description: hasProbePack(level)
        ? 'Practice quiz for interview prep.'
        : 'Quiz from the RSAF Commands question bank.',
      keyPoints: hasProbePack(level)
        ? ['Practice', 'Interview prep']
        : ['Assessment', 'Twenty bank items'],
      order,
      quizConfig: DEFAULT_QUIZ_CONFIG,
    },
    order,
    level,
  );
}

/**
 * Repair an outline list into the level-specific sortie shape.
 * Prefer keeping model content.
 */
export function normalizeSortieOutlines(
  outlines: readonly SceneOutline[],
  assessmentLevel: AssessmentLevel = 'L1',
): SceneOutline[] {
  const slideCount = slideCountForLevel(assessmentLevel);
  const slides = outlines.filter((o) => o.type === 'slide').slice(0, slideCount);
  const interactiveSource =
    outlines.find((o) => o.type === 'interactive') ??
    outlines.find((o) => o.type === 'pbl') ??
    outlines.find((o) => o.type !== 'slide' && o.type !== 'quiz' && o.type !== 'probe_pack');

  const quizSource =
    [...outlines].reverse().find((o) => o.type === 'quiz') ??
    outlines.find((o) => o.type === 'quiz');

  const probeSource = outlines.find((o) => o.type === 'probe_pack');

  const result: SceneOutline[] = [];
  for (let i = 0; i < slideCount; i += 1) {
    const order = i + 1;
    const source = slides[i];
    result.push(source ? asSlide(source, order) : padSlide(order, i + 1));
  }

  const interactiveOrder = slideCount + 1;
  result.push(
    interactiveSource
      ? asInteractive(interactiveSource, interactiveOrder)
      : padInteractive(interactiveOrder, assessmentLevel),
  );

  const quizOrder = slideCount + 2;
  result.push(
    quizSource
      ? asQuiz(quizSource, quizOrder, assessmentLevel)
      : padQuiz(quizOrder, assessmentLevel),
  );

  if (hasProbePack(assessmentLevel)) {
    const probeOrder = slideCount + 3;
    result.push(asProbePack(probeSource, probeOrder, assessmentLevel));
  }

  const used = new Set<string>();
  return result.map((outline, index) => {
    let id = outline.id?.trim() || `scene_${index + 1}`;
    if (used.has(id)) id = `${id}_${index + 1}`;
    used.add(id);
    return { ...outline, id, order: index + 1 };
  });
}

/** True when outlines already match the sortie contract for the given level. */
export function isSortieOutlineShape(
  outlines: readonly SceneOutline[],
  assessmentLevel: AssessmentLevel = 'L1',
): boolean {
  if (outlines.length !== SORTIE_TOTAL_SCENES) return false;
  const slideCount = slideCountForLevel(assessmentLevel);
  const slides = outlines.filter((o) => o.type === 'slide');
  const interactive = outlines.filter((o) => o.type === 'interactive');
  const quiz = outlines.filter((o) => o.type === 'quiz');
  const probes = outlines.filter((o) => o.type === 'probe_pack');
  if (slides.length !== slideCount) return false;
  if (interactive.length !== SORTIE_INTERACTIVE_COUNT) return false;
  if (quiz.length !== SORTIE_QUIZ_COUNT) return false;
  if (hasProbePack(assessmentLevel)) {
    if (probes.length !== SORTIE_PROBE_PACK_COUNT) return false;
    const last = outlines[outlines.length - 1];
    const quizScene = outlines[outlines.length - 2];
    return (
      last?.type === 'probe_pack' &&
      quizScene?.type === 'quiz' &&
      quizScene.quizConfig?.questionCount === SORTIE_QUIZ_QUESTION_COUNT
    );
  }
  if (probes.length !== 0) return false;
  const last = outlines[outlines.length - 1];
  return last?.type === 'quiz' && last.quizConfig?.questionCount === SORTIE_QUIZ_QUESTION_COUNT;
}
