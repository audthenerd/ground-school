/**
 * Fixed Ground School classroom shape: 9 lecture slides, 1 interactive page,
 * 1 terminal quiz with 20 questions.
 *
 * Outline prompts ask for this; {@link normalizeSortieOutlines} repairs near-misses
 * so curriculum/sortie runs stay on contract.
 */
import type { SceneOutline } from '@/lib/types/generation';

export const SORTIE_SLIDE_COUNT = 9;
export const SORTIE_INTERACTIVE_COUNT = 1;
export const SORTIE_QUIZ_COUNT = 1;
export const SORTIE_QUIZ_QUESTION_COUNT = 20;
export const SORTIE_TOTAL_SCENES =
  SORTIE_SLIDE_COUNT + SORTIE_INTERACTIVE_COUNT + SORTIE_QUIZ_COUNT;

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
  return next;
}

function quizTitle(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/\bpractice\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'RSAF Commands Quiz';
}

function asQuiz(outline: SceneOutline, order: number): SceneOutline {
  const next: SceneOutline = {
    ...outline,
    type: 'quiz',
    order,
    title: quizTitle(outline.title),
    description:
      outline.description
        ?.trim()
        .replace(/\bpractice\b/gi, 'assessment')
        .trim() || 'Quiz: twenty questions from the RSAF Commands question bank.',
    keyPoints:
      outline.keyPoints?.length > 0
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
  return next;
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

function padInteractive(order: number): SceneOutline {
  return asInteractive(
    {
      id: 'scene_interactive_pad',
      type: 'interactive',
      title: 'Apply: match the need to the command',
      description:
        'Interactive Apply/Analyse page: the Trainee matches a stated need to the right command or group.',
      keyPoints: ['Apply', 'Analyse', 'ADOC vs APGC'],
      order,
      ...DEFAULT_INTERACTIVE,
    },
    order,
  );
}

function padQuiz(order: number): SceneOutline {
  return asQuiz(
    {
      id: 'scene_quiz_pad',
      type: 'quiz',
      title: 'RSAF Commands Quiz',
      description: 'Quiz from the RSAF Commands question bank.',
      keyPoints: ['Assessment', 'Twenty bank items'],
      order,
      quizConfig: DEFAULT_QUIZ_CONFIG,
    },
    order,
  );
}

/**
 * Repair an outline list into the fixed 9+1+1 sortie shape.
 * Prefer keeping model content: take up to 9 slides in order, one interactive
 * (first interactive/pbl coerced), and force a terminal quiz with 20 questions.
 */
export function normalizeSortieOutlines(outlines: readonly SceneOutline[]): SceneOutline[] {
  const slides = outlines.filter((o) => o.type === 'slide').slice(0, SORTIE_SLIDE_COUNT);
  const interactiveSource =
    outlines.find((o) => o.type === 'interactive') ??
    outlines.find((o) => o.type === 'pbl') ??
    outlines.find((o) => o.type !== 'slide' && o.type !== 'quiz');

  const quizSource =
    [...outlines].reverse().find((o) => o.type === 'quiz') ?? outlines[outlines.length - 1];

  const result: SceneOutline[] = [];
  for (let i = 0; i < SORTIE_SLIDE_COUNT; i += 1) {
    const order = i + 1;
    const source = slides[i];
    result.push(source ? asSlide(source, order) : padSlide(order, i + 1));
  }

  const interactiveOrder = SORTIE_SLIDE_COUNT + 1;
  result.push(
    interactiveSource
      ? asInteractive(interactiveSource, interactiveOrder)
      : padInteractive(interactiveOrder),
  );

  const quizOrder = SORTIE_TOTAL_SCENES;
  result.push(quizSource ? asQuiz(quizSource, quizOrder) : padQuiz(quizOrder));

  const used = new Set<string>();
  return result.map((outline, index) => {
    let id = outline.id?.trim() || `scene_${index + 1}`;
    if (used.has(id)) id = `${id}_${index + 1}`;
    used.add(id);
    return { ...outline, id, order: index + 1 };
  });
}

/** True when outlines already match the fixed sortie contract. */
export function isSortieOutlineShape(outlines: readonly SceneOutline[]): boolean {
  if (outlines.length !== SORTIE_TOTAL_SCENES) return false;
  const slides = outlines.filter((o) => o.type === 'slide');
  const interactive = outlines.filter((o) => o.type === 'interactive');
  const quiz = outlines.filter((o) => o.type === 'quiz');
  if (slides.length !== SORTIE_SLIDE_COUNT) return false;
  if (interactive.length !== SORTIE_INTERACTIVE_COUNT) return false;
  if (quiz.length !== SORTIE_QUIZ_COUNT) return false;
  const last = outlines[outlines.length - 1];
  return last?.type === 'quiz' && last.quizConfig?.questionCount === SORTIE_QUIZ_QUESTION_COUNT;
}
