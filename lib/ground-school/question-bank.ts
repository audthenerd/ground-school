/**
 * RAiD Ops Immersion question bank — learning objectives for generation.
 *
 * Source of truth: Google Sheet
 * https://docs.google.com/spreadsheets/d/1r2f6gbMba1HwWHBKGs_A-A5QEXdhSkwAF3ZzdZ9uQFc
 * Sync into this repo via CSV: `pnpm sync:question-bank -- path/to/export.csv`
 * Drafts written during generation land in question-bank.json + question-bank-drafts.csv
 * for manual re-import into the Sheet.
 *
 * Slides must teach the facts in each item's explanation + answer so the Trainee
 * can answer that item. The classroom quiz samples from this bank.
 */

import fs from 'fs';
import path from 'path';

/**
 * Bloom's taxonomy cognitive levels (revised, Vanderbilt Center for Teaching).
 * Questions are classified by the cognitive process they test.
 */
export const BLOOMS_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const;

export type BloomsLevel = (typeof BLOOMS_LEVELS)[number];

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
  /** Bloom's taxonomy level (null = unclassified). */
  bloomsLevel: BloomsLevel | null;
}

/** Default Start Mission sortie: RSAF Commands foundation. */
export const DEFAULT_SORTIE_TOPICS = ['RSAF Commands'] as const;

const BANK_FILENAME = 'question-bank.json';
const DRAFTS_CSV_FILENAME = 'question-bank-drafts.csv';

let cached: QuestionBankItem[] | null = null;

function bankPath(): string {
  return path.join(process.cwd(), 'lib', 'ground-school', BANK_FILENAME);
}

function draftsCsvPath(): string {
  return path.join(process.cwd(), 'lib', 'ground-school', DRAFTS_CSV_FILENAME);
}

export function clearQuestionBankCache(): void {
  cached = null;
}

export function loadQuestionBank(): QuestionBankItem[] {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(bankPath(), 'utf-8')) as QuestionBankItem[];
  cached = raw;
  return raw;
}

export function saveQuestionBank(items: QuestionBankItem[]): void {
  fs.writeFileSync(bankPath(), `${JSON.stringify(items, null, 2)}\n`, 'utf-8');
  cached = items;
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
  lines.push(
    '- Apply/Analyse scenes reuse taught distinctions; do not introduce new bank facts there.',
  );
  lines.push(
    '- The terminal quiz is an actual assessment: present twenty bank items exactly; do not invent quiz stems.',
  );
  lines.push('- Do not call the quiz a practice quiz.');

  return lines.join('\n').trim();
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

const CSV_HEADERS = [
  'ID',
  'Question',
  'Field Type',
  'Options',
  'Correct Answer',
  'Explanation',
  'Topic',
  'Subtopic',
  'Difficulty',
  'Status',
  'Source',
  "Bloom's Level",
] as const;

function headerIndex(headers: string[], name: string): number {
  const lower = name.toLowerCase();
  return headers.findIndex((h) => h.trim().toLowerCase() === lower);
}

function parseBloomsLevel(value: string): BloomsLevel | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (BLOOMS_LEVELS.includes(normalized as BloomsLevel)) {
    return normalized as BloomsLevel;
  }
  return null;
}

/** Parse a Sheets CSV export into bank items. Throws on validation failures. */
export function parseQuestionBankCsv(csv: string): QuestionBankItem[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  const idx = {
    id: headerIndex(headers, 'ID'),
    question: headerIndex(headers, 'Question'),
    fieldType: headerIndex(headers, 'Field Type'),
    options: headerIndex(headers, 'Options'),
    correctAnswer: headerIndex(headers, 'Correct Answer'),
    explanation: headerIndex(headers, 'Explanation'),
    topic: headerIndex(headers, 'Topic'),
    subtopic: headerIndex(headers, 'Subtopic'),
    difficulty: headerIndex(headers, 'Difficulty'),
    status: headerIndex(headers, 'Status'),
    source: headerIndex(headers, 'Source'),
    bloomsLevel: headerIndex(headers, "Bloom's Level"),
  };
  const requiredColumns = [
    'id',
    'question',
    'fieldType',
    'options',
    'correctAnswer',
    'explanation',
    'topic',
    'subtopic',
    'difficulty',
    'status',
    'source',
  ] as const;
  for (const key of requiredColumns) {
    if (idx[key] < 0) throw new Error(`CSV missing required column: ${key}`);
  }

  const items: QuestionBankItem[] = [];
  const seen = new Set<string>();
  for (let row = 1; row < lines.length; row += 1) {
    const cells = parseCsvLine(lines[row]!);
    const id = (cells[idx.id] ?? '').trim();
    const question = (cells[idx.question] ?? '').trim();
    const fieldType = (cells[idx.fieldType] ?? '').trim();
    const optionsRaw = (cells[idx.options] ?? '').trim();
    const correctAnswer = (cells[idx.correctAnswer] ?? '').trim();
    const explanation = (cells[idx.explanation] ?? '').trim();
    const topic = (cells[idx.topic] ?? '').trim();
    const subtopic = (cells[idx.subtopic] ?? '').trim();
    const difficulty = (cells[idx.difficulty] ?? '').trim() || '1.0';
    const status = (cells[idx.status] ?? '').trim() || 'Draft';
    const source = (cells[idx.source] ?? '').trim();

    if (!id) throw new Error(`Row ${row + 1}: blank ID`);
    if (seen.has(id)) throw new Error(`Row ${row + 1}: duplicate ID ${id}`);
    seen.add(id);
    if (!question) throw new Error(`Row ${row + 1} (${id}): blank Question`);
    if (!source) throw new Error(`Row ${row + 1} (${id}): blank Source`);

    const options = optionsRaw
      ? optionsRaw
          .split('|')
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
    const choiceType = /^(radio|dropdown|checkbox|yes\/no)$/i.test(fieldType);
    if (choiceType && options.length > 0) {
      const answers = correctAnswer
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean);
      for (const answer of answers) {
        const ok =
          options.some((o) => o.toLowerCase() === answer.toLowerCase()) ||
          /^(0|1|true|false|yes|no)$/i.test(answer);
        if (!ok) {
          throw new Error(
            `Row ${row + 1} (${id}): Correct Answer "${answer}" not present in Options`,
          );
        }
      }
    }

    const bloomsLevelRaw = idx.bloomsLevel >= 0 ? (cells[idx.bloomsLevel] ?? '').trim() : '';
    const bloomsLevel = parseBloomsLevel(bloomsLevelRaw);

    items.push({
      id,
      question,
      fieldType: fieldType || 'Radio',
      options,
      correctAnswer,
      explanation,
      topic: topic || 'RSAF Commands',
      subtopic,
      difficulty,
      status,
      source,
      bloomsLevel,
    });
  }
  return items;
}

export function questionBankToCsv(items: readonly QuestionBankItem[]): string {
  const rows = [CSV_HEADERS.join(',')];
  for (const item of items) {
    rows.push(
      [
        item.id,
        item.question,
        item.fieldType,
        item.options.join('|'),
        item.correctAnswer,
        item.explanation,
        item.topic,
        item.subtopic,
        item.difficulty,
        item.status,
        item.source,
        item.bloomsLevel ?? '',
      ]
        .map(escapeCsv)
        .join(','),
    );
  }
  return `${rows.join('\n')}\n`;
}

function nextQuestionId(existing: readonly QuestionBankItem[]): string {
  let max = 0;
  for (const item of existing) {
    const match = /^Q(\d+)$/i.exec(item.id.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Q${String(max + 1).padStart(3, '0')}`;
}

export interface DraftQuestionInput {
  question: string;
  fieldType?: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  source?: string;
  bloomsLevel?: BloomsLevel | null;
}

/**
 * Append generation-proposed questions as Draft rows (deduped by stem).
 * Also appends to question-bank-drafts.csv for Sheets re-import.
 */
export function appendDraftQuestions(inputs: readonly DraftQuestionInput[]): QuestionBankItem[] {
  if (inputs.length === 0) return [];
  const bank = [...loadQuestionBank()];
  const stems = new Set(
    bank.map((item) => item.question.trim().toLowerCase().replace(/\s+/g, ' ')),
  );
  const added: QuestionBankItem[] = [];

  for (const input of inputs) {
    const question = input.question?.trim();
    if (!question) continue;
    const stem = question.toLowerCase().replace(/\s+/g, ' ');
    if (stems.has(stem)) continue;
    stems.add(stem);
    const item: QuestionBankItem = {
      id: nextQuestionId([...bank, ...added]),
      question,
      fieldType: input.fieldType?.trim() || 'Radio',
      options: input.options ?? [],
      correctAnswer: input.correctAnswer?.trim() ?? '',
      explanation: input.explanation?.trim() ?? '',
      topic: input.topic?.trim() || DEFAULT_SORTIE_TOPICS[0],
      subtopic: input.subtopic?.trim() ?? '',
      difficulty: input.difficulty?.trim() || '1.0',
      status: 'Draft',
      source: input.source?.trim() || 'generation',
      bloomsLevel: input.bloomsLevel ?? null,
    };
    added.push(item);
  }

  if (added.length === 0) return [];

  saveQuestionBank([...bank, ...added]);

  const csvPath = draftsCsvPath();
  const existingCsv = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : '';
  const headerLine = CSV_HEADERS.join(',');
  const body = questionBankToCsv(added)
    .split(/\r?\n/)
    .filter((line) => line && line !== headerLine)
    .join('\n');
  if (!existingCsv.trim()) {
    fs.writeFileSync(csvPath, `${headerLine}\n${body}\n`, 'utf-8');
  } else {
    fs.appendFileSync(csvPath, `${body.endsWith('\n') ? body : `${body}\n`}`, 'utf-8');
  }

  return added;
}
