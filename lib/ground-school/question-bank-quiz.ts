/**
 * Map question-bank rows onto classroom QuizQuestion payloads, and sample
 * a fixed assessment set for the RSAF Commands sortie with Bloom's level spread.
 */
import type { QuizQuestion } from '@/lib/types/stage';
import {
  BLOOMS_LEVELS,
  type BloomsLevel,
  DEFAULT_SORTIE_TOPICS,
  filterQuestionBank,
  type QuestionBankItem,
} from '@/lib/ground-school/question-bank';
import { SORTIE_QUIZ_QUESTION_COUNT } from '@/lib/ground-school/classroom-format';

/**
 * Default Bloom's level distribution for quiz generation.
 * Values are target proportions (percentages) for a 20-question quiz:
 * - remember: 15% (3 questions) - recall facts
 * - understand: 25% (5 questions) - explain concepts
 * - apply: 25% (5 questions) - use in new situations
 * - analyze: 20% (4 questions) - draw connections
 * - evaluate: 10% (2 questions) - justify decisions
 * - create: 5% (1 question) - produce original work
 *
 * When questions are unavailable at a level, the quota overflows to other levels.
 */
export const DEFAULT_BLOOMS_DISTRIBUTION: Record<BloomsLevel, number> = {
  remember: 15,
  understand: 25,
  apply: 25,
  analyze: 20,
  evaluate: 10,
  create: 5,
};

export type BloomsDistribution = Partial<Record<BloomsLevel, number>>;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizeStem(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fieldTypeToQuizType(fieldType: string): QuizQuestion['type'] {
  const t = fieldType.trim().toLowerCase();
  if (t === 'checkbox') return 'multiple';
  if (t === 'long answer' || t === 'long_answer' || t === 'text') return 'short_answer';
  return 'single';
}

function splitMultiAnswers(correctAnswer: string): string[] {
  return correctAnswer
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchOptionIndex(options: string[], answer: string): number {
  const needle = answer.trim().toLowerCase();
  let idx = options.findIndex((opt) => opt.trim().toLowerCase() === needle);
  if (idx >= 0) return idx;
  // Yes/No bank rows sometimes store "1"/"0" instead of True/False text.
  if (needle === '1' || needle === 'true' || needle === 'yes') {
    idx = options.findIndex((opt) => /^(true|yes)$/i.test(opt.trim()));
    if (idx >= 0) return idx;
  }
  if (needle === '0' || needle === 'false' || needle === 'no') {
    idx = options.findIndex((opt) => /^(false|no)$/i.test(opt.trim()));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Convert one bank item into a classroom quiz question (exact wording). */
export function bankItemToQuizQuestion(item: QuestionBankItem): QuizQuestion {
  const type = fieldTypeToQuizType(item.fieldType);
  if (type === 'short_answer') {
    return {
      id: item.id,
      type,
      question: item.question,
      analysis: item.explanation,
      hasAnswer: false,
      commentPrompt: item.correctAnswer
        ? `Expected answer guidance: ${item.correctAnswer}`
        : undefined,
      points: 1,
      bloomsLevel: item.bloomsLevel ?? undefined,
    };
  }

  const options = item.options.map((label, index) => ({
    label,
    value: LETTERS[index] ?? `O${index + 1}`,
  }));

  const answerValues: string[] = [];
  for (const part of splitMultiAnswers(item.correctAnswer)) {
    const idx = matchOptionIndex(item.options, part);
    if (idx >= 0 && options[idx]) answerValues.push(options[idx]!.value);
  }

  return {
    id: item.id,
    type,
    question: item.question,
    options,
    answer: answerValues.length > 0 ? answerValues : undefined,
    analysis: item.explanation,
    hasAnswer: answerValues.length > 0,
    points: 1,
    bloomsLevel: item.bloomsLevel ?? undefined,
  };
}

/** FNV-1a 32-bit hash for deterministic sampling. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}

/**
 * Calculate target counts per Bloom's level from distribution percentages.
 */
function calculateBloomsTargets(
  total: number,
  distribution: BloomsDistribution,
): Map<BloomsLevel | null, number> {
  const targets = new Map<BloomsLevel | null, number>();
  let allocated = 0;
  const dist = { ...DEFAULT_BLOOMS_DISTRIBUTION, ...distribution };

  for (const level of BLOOMS_LEVELS) {
    const target = Math.round((dist[level] / 100) * total);
    targets.set(level, target);
    allocated += target;
  }

  // Distribute remainder to 'understand' (most common level)
  if (allocated < total) {
    targets.set('understand', (targets.get('understand') ?? 0) + (total - allocated));
  }

  // Unclassified questions can fill gaps
  targets.set(null, 0);

  return targets;
}

/**
 * Group items by Bloom's level.
 */
function groupByBloomsLevel(
  items: QuestionBankItem[],
): Map<BloomsLevel | null, QuestionBankItem[]> {
  const groups = new Map<BloomsLevel | null, QuestionBankItem[]>();
  for (const level of [...BLOOMS_LEVELS, null]) {
    groups.set(level, []);
  }
  for (const item of items) {
    const level = item.bloomsLevel;
    groups.get(level)!.push(item);
  }
  return groups;
}

/**
 * Deterministically sample up to `count` bank items for the given topics,
 * distributing across Bloom's taxonomy levels.
 *
 * The distribution is configurable; defaults to a balanced spread across
 * cognitive levels. When a level has too few questions, the quota overflows
 * to other levels. Unclassified questions fill remaining gaps.
 *
 * Prefers choice questions (auto-gradable) when trimming within each level.
 */
export function sampleBankItemsForQuiz(options: {
  topics?: readonly string[];
  count?: number;
  seed: string;
  bloomsDistribution?: BloomsDistribution;
}): QuestionBankItem[] {
  const count = options.count ?? SORTIE_QUIZ_QUESTION_COUNT;
  const pool = [...filterQuestionBank(options.topics ?? DEFAULT_SORTIE_TOPICS)];
  const rand = mulberry32(hashSeed(options.seed));

  // Shuffle pool deterministically
  shuffleInPlace(pool, rand);

  // Sort by auto-gradability (choice questions first)
  const sortedPool = pool.sort((a, b) => {
    const aIsChoice = fieldTypeToQuizType(a.fieldType) !== 'short_answer' ? 0 : 1;
    const bIsChoice = fieldTypeToQuizType(b.fieldType) !== 'short_answer' ? 0 : 1;
    return aIsChoice - bIsChoice;
  });

  // Group by Bloom's level
  const groups = groupByBloomsLevel(sortedPool);
  const targets = calculateBloomsTargets(count, options.bloomsDistribution ?? {});

  // Sample from each level up to its target
  const selected: QuestionBankItem[] = [];
  const remaining = new Map<BloomsLevel | null, QuestionBankItem[]>();
  let overflow = 0;

  // First pass: take up to target from each level
  for (const level of [...BLOOMS_LEVELS, null]) {
    const levelItems = groups.get(level) ?? [];
    const target = targets.get(level) ?? 0;
    const take = Math.min(target, levelItems.length);

    selected.push(...levelItems.slice(0, take));
    remaining.set(level, levelItems.slice(take));
    overflow += Math.max(0, target - levelItems.length);
  }

  // Second pass: fill overflow with remaining questions from any level
  // Prefer choice questions when filling
  if (overflow > 0 && selected.length < count) {
    const fillPool: QuestionBankItem[] = [];
    for (const [, items] of remaining) {
      fillPool.push(...items);
    }
    // Sort fill pool to prefer choice questions, then shuffle within each type
    const fillChoice = fillPool.filter(
      (item) => fieldTypeToQuizType(item.fieldType) !== 'short_answer',
    );
    const fillText = fillPool.filter(
      (item) => fieldTypeToQuizType(item.fieldType) === 'short_answer',
    );
    shuffleInPlace(fillChoice, rand);
    shuffleInPlace(fillText, rand);
    const orderedFill = [...fillChoice, ...fillText];
    const needed = Math.min(overflow, count - selected.length, orderedFill.length);
    selected.push(...orderedFill.slice(0, needed));
  }

  // Final shuffle to mix levels
  shuffleInPlace(selected, rand);

  return selected.slice(0, count);
}

export function sampleQuizQuestionsFromBank(options: {
  topics?: readonly string[];
  count?: number;
  seed: string;
}): QuizQuestion[] {
  return sampleBankItemsForQuiz(options).map(bankItemToQuizQuestion);
}

export function normalizeQuestionStem(question: string): string {
  return normalizeStem(question);
}
