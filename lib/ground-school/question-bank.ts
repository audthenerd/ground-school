/**
 * RAiD Ops Immersion question bank — learning objectives for generation.
 *
 * Source: exported Google Sheet / Excel bank. Slides must teach the facts in
 * each item's explanation + answer so the Trainee can answer that item.
 * Scored exams stay bank-driven; generated quizzes are practice only.
 */

import fs from 'fs';
import path from 'path';

export interface QuestionBankItem {
  id: string;
  question: string;
  fieldType: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  status: string;
  source: string;
}

/** Default Start Mission sortie: RSAF Commands foundation. */
export const DEFAULT_SORTIE_TOPICS = ['RSAF Commands'] as const;

const BANK_FILENAME = 'question-bank.json';

let cached: QuestionBankItem[] | null = null;

function bankPath(): string {
  return path.join(process.cwd(), 'lib', 'ground-school', BANK_FILENAME);
}

export function loadQuestionBank(): QuestionBankItem[] {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(bankPath(), 'utf-8')) as QuestionBankItem[];
  cached = raw;
  return raw;
}

export function listQuestionBankTopics(): string[] {
  return [...new Set(loadQuestionBank().map((item) => item.topic))].sort();
}

export function filterQuestionBank(topics?: readonly string[]): QuestionBankItem[] {
  const all = loadQuestionBank();
  if (!topics?.length) return all;
  const set = new Set(topics);
  return all.filter((item) => set.has(item.topic));
}

/**
 * Markdown block listing learning objectives for the given topics.
 * Includes question stem + teachable fact + target answer + source so
 * outline/slide generation can cover what the Trainee will be asked.
 */
export function formatQuestionBankObjectives(
  topics: readonly string[] = DEFAULT_SORTIE_TOPICS,
): string {
  const items = filterQuestionBank(topics);
  const allTopics = listQuestionBankTopics();
  const lines: string[] = [
    '# Question-bank learning objectives (this sortie)',
    '',
    'These items are the syllabus for THIS lesson. Every slide must teach facts',
    'the Trainee needs to answer the items below. Prefer the Teach / Target answer',
    'fields; cite Source. Do not invent operational detail beyond them.',
    '',
    'Do NOT put these meta rules, Bloom weights, or agent-role instructions on slides',
    'as lesson content. Slides teach domain facts only.',
    '',
    `Topics in this sortie: ${topics.join(', ') || '(all)'}`,
    `Items in this sortie: ${items.length}`,
    `Full bank topics (out of scope unless listed above): ${allTopics.join(', ')}`,
    '',
  ];

  const byTopic = new Map<string, QuestionBankItem[]>();
  for (const item of items) {
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }

  for (const topic of [...byTopic.keys()].sort()) {
    lines.push(`## ${topic}`);
    const bySub = new Map<string, QuestionBankItem[]>();
    for (const item of byTopic.get(topic)!) {
      const list = bySub.get(item.subtopic) ?? [];
      list.push(item);
      bySub.set(item.subtopic, list);
    }
    for (const subtopic of [...bySub.keys()].sort()) {
      lines.push(`### ${subtopic}`);
      for (const item of bySub.get(subtopic)!) {
        lines.push(`- **${item.id}** — ${item.question}`);
        lines.push(`  - Teach: ${item.explanation}`);
        lines.push(`  - Target answer: ${item.correctAnswer}`);
        lines.push(`  - Source: ${item.source}`);
      }
      lines.push('');
    }
  }

  lines.push('## Outline / slide mapping rules');
  lines.push('- Name which question IDs each slide unlocks (e.g. unlocks: Q001, Q008).');
  lines.push('- Cover every item in this sortie at least once across Remember/Understand slides.');
  lines.push('- Apply/Analyse scenes reuse taught distinctions; do not introduce new bank facts there.');
  lines.push(
    '- Practice quiz scenes may only test facts taught earlier in THIS lesson (same IDs or close paraphrases). Label them as practice.',
  );
  lines.push('- Never generate a scored exam from this bank here.');

  return lines.join('\n').trim();
}
