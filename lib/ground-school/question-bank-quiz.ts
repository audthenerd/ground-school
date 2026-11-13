/**
 * Map question-bank rows onto classroom QuizQuestion payloads, and sample
 * a fixed assessment set for the RSAF Commands sortie.
 */
import type { QuizQuestion } from '@/lib/types/stage';
import {
  DEFAULT_SORTIE_TOPICS,
  filterQuestionBank,
  type QuestionBankItem,
} from '@/lib/ground-school/question-bank';
import { SORTIE_QUIZ_QUESTION_COUNT } from '@/lib/ground-school/classroom-format';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizeStem(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fieldTypeToQuizType(
  fieldType: string,
): QuizQuestion['type'] {
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
 * Deterministically sample up to `count` bank items for the given topics.
 * Prefers choice questions (auto-gradable) when trimming a larger pool.
 */
export function sampleBankItemsForQuiz(options: {
  topics?: readonly string[];
  count?: number;
  seed: string;
}): QuestionBankItem[] {
  const count = options.count ?? SORTIE_QUIZ_QUESTION_COUNT;
  const pool = [...filterQuestionBank(options.topics ?? DEFAULT_SORTIE_TOPICS)];
  const rand = mulberry32(hashSeed(options.seed));
  shuffleInPlace(pool, rand);

  const choice = pool.filter((item) => fieldTypeToQuizType(item.fieldType) !== 'short_answer');
  const text = pool.filter((item) => fieldTypeToQuizType(item.fieldType) === 'short_answer');
  const ordered = [...choice, ...text];
  return ordered.slice(0, Math.min(count, ordered.length));
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
