/**
 * Auto-classify question bank items by Bloom's taxonomy level.
 *
 * Uses verb/keyword heuristics based on the revised Bloom's taxonomy
 * (Vanderbilt Center for Teaching). Output is a CSV with suggested levels
 * for review and editing.
 *
 * Usage:
 *   pnpm tsx scripts/classify-blooms.ts
 *   pnpm tsx scripts/classify-blooms.ts --apply  # Apply suggestions to question-bank.json
 *   pnpm tsx scripts/classify-blooms.ts --csv    # Output CSV only
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  BLOOMS_LEVELS,
  type BloomsLevel,
  loadQuestionBank,
  type QuestionBankItem,
  saveQuestionBank,
} from '../lib/ground-school/question-bank';

/**
 * Bloom's taxonomy verb indicators (revised, Vanderbilt Center for Teaching).
 * Each level has characteristic verbs that signal the cognitive process required.
 */
const BLOOMS_VERBS: Record<BloomsLevel, string[]> = {
  remember: [
    'define', 'list', 'state', 'name', 'identify', 'recall', 'recognize',
    'describe', 'label', 'match', 'select', 'locate', 'memorize', 'repeat',
    'what is', 'who is', 'where is', 'when did', 'how many', 'which',
  ],
  understand: [
    'explain', 'classify', 'describe', 'discuss', 'identify', 'illustrate',
    'interpret', 'paraphrase', 'summarize', 'translate', 'compare', 'contrast',
    'distinguish', 'estimate', 'infer', 'predict', 'why', 'how does',
    'what does', 'in your own words', 'give an example',
  ],
  apply: [
    'apply', 'execute', 'implement', 'solve', 'use', 'demonstrate', 'compute',
    'calculate', 'complete', 'show', 'operate', 'practice', 'schedule',
    'sketch', 'determine', 'how would you', 'what would happen if',
  ],
  analyze: [
    'analyze', 'differentiate', 'compare', 'contrast', 'examine', 'organize',
    'outline', 'attribute', 'deconstruct', 'discriminate', 'distinguish',
    'integrate', 'structure', 'what is the relationship', 'what is the difference',
    'what are the parts', 'how is related to', 'why do you think',
  ],
  evaluate: [
    'evaluate', 'appraise', 'argue', 'judge', 'critique', 'defend', 'justify',
    'support', 'assess', 'conclude', 'decide', 'prioritize', 'rank', 'rate',
    'recommend', 'verify', 'do you agree', 'what is the best', 'would you recommend',
  ],
  create: [
    'create', 'design', 'construct', 'develop', 'formulate', 'author', 'build',
    'compose', 'devise', 'generate', 'invent', 'plan', 'produce', 'propose',
    'write', 'how would you design', 'what would you create', 'can you devise',
  ],
};

/**
 * Question type indicators that often correlate with Bloom's levels.
 */
const TYPE_INDICATORS: { pattern: RegExp; suggestedLevel: BloomsLevel; weight: number }[] = [
  { pattern: /^(true|false|yes\/no)$/i, suggestedLevel: 'remember', weight: 0.3 },
  { pattern: /^radio$/i, suggestedLevel: 'understand', weight: 0.1 },
  { pattern: /^(long answer|text)$/i, suggestedLevel: 'apply', weight: 0.2 },
  { pattern: /^checkbox$/i, suggestedLevel: 'analyze', weight: 0.1 },
];

/**
 * Calculate confidence scores for each Bloom's level based on question text.
 */
function calculateLevelScores(item: QuestionBankItem): Record<BloomsLevel, number> {
  const scores: Record<BloomsLevel, number> = {
    remember: 0,
    understand: 0,
    apply: 0,
    analyze: 0,
    evaluate: 0,
    create: 0,
  };

  const text = `${item.question} ${item.explanation}`.toLowerCase();

  // Score based on verb matches
  for (const level of BLOOMS_LEVELS) {
    for (const verb of BLOOMS_VERBS[level]) {
      const regex = new RegExp(`\\b${verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        // Weight early matches (in question) higher than late matches (in explanation)
        const questionMatches = item.question.toLowerCase().match(regex);
        scores[level] += (questionMatches?.length ?? 0) * 2;
        scores[level] += (matches.length - (questionMatches?.length ?? 0)) * 0.5;
      }
    }
  }

  // Add bonus for question type indicators
  for (const indicator of TYPE_INDICATORS) {
    if (indicator.pattern.test(item.fieldType)) {
      scores[indicator.suggestedLevel] += indicator.weight;
    }
  }

  // Normalize scores
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const level of BLOOMS_LEVELS) {
      scores[level] /= total;
    }
  }

  return scores;
}

/**
 * Suggest a Bloom's level for a question.
 */
function suggestBloomsLevel(item: QuestionBankItem): {
  level: BloomsLevel;
  confidence: number;
  scores: Record<BloomsLevel, number>;
} {
  const scores = calculateLevelScores(item);

  // Find the highest scoring level
  let bestLevel: BloomsLevel = 'understand';
  let bestScore = 0;

  for (const level of BLOOMS_LEVELS) {
    if (scores[level] > bestScore) {
      bestScore = scores[level];
      bestLevel = level;
    }
  }

  // If no strong signal, default to 'understand' for factual questions
  // or 'apply' for procedural questions
  if (bestScore < 0.1) {
    const isFactual = /^(what|who|where|when|which|name|identify)/i.test(item.question);
    const isProcedural = /^(how|explain|describe)/i.test(item.question);
    if (isFactual) {
      bestLevel = 'remember';
      bestScore = 0.5;
    } else if (isProcedural) {
      bestLevel = 'understand';
      bestScore = 0.5;
    }
  }

  return {
    level: bestLevel,
    confidence: bestScore,
    scores,
  };
}

/**
 * Generate a CSV with suggested Bloom's levels for review.
 */
function generateReviewCsv(
  items: QuestionBankItem[],
  suggestions: Map<string, { level: BloomsLevel; confidence: number }>,
): string {
  const headers = [
    'ID',
    'Question',
    'Current Level',
    'Suggested Level',
    'Confidence',
    'Topic',
    'Subtopic',
  ];

  const rows = [headers.join(',')];

  for (const item of items) {
    const suggestion = suggestions.get(item.id);
    const cells = [
      item.id,
      `"${item.question.replace(/"/g, '""')}"`,
      item.bloomsLevel ?? '',
      suggestion?.level ?? '',
      suggestion ? (suggestion.confidence * 100).toFixed(0) + '%' : '',
      item.topic,
      item.subtopic,
    ];
    rows.push(cells.join(','));
  }

  return rows.join('\n') + '\n';
}

function main(): void {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const csvOnly = args.includes('--csv');

  const items = loadQuestionBank();
  const suggestions = new Map<string, { level: BloomsLevel; confidence: number }>();

  let classified = 0;
  let unclassified = 0;

  console.log('Analyzing question bank...\n');

  for (const item of items) {
    if (item.bloomsLevel) {
      classified++;
      continue;
    }

    const suggestion = suggestBloomsLevel(item);
    suggestions.set(item.id, { level: suggestion.level, confidence: suggestion.confidence });
    unclassified++;
  }

  console.log(`Total questions: ${items.length}`);
  console.log(`Already classified: ${classified}`);
  console.log(`Needs classification: ${unclassified}`);

  if (unclassified === 0) {
    console.log('\nAll questions are already classified.');
    return;
  }

  // Generate CSV for review
  const csvPath = path.join(process.cwd(), 'lib', 'ground-school', 'blooms-suggestions.csv');
  const csv = generateReviewCsv(items, suggestions);
  fs.writeFileSync(csvPath, csv, 'utf-8');
  console.log(`\nSuggestions written to: ${csvPath}`);

  if (csvOnly) {
    console.log('\nCSV-only mode. Review the file and edit levels manually.');
    console.log('Then run with --apply to apply changes.');
    return;
  }

  // Show summary by level
  const levelCounts = new Map<BloomsLevel, number>();
  for (const [, { level }] of suggestions) {
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }

  console.log('\nSuggested distribution:');
  for (const level of BLOOMS_LEVELS) {
    const count = levelCounts.get(level) ?? 0;
    const pct = unclassified > 0 ? ((count / unclassified) * 100).toFixed(1) : '0.0';
    console.log(`  ${level.padEnd(10)}: ${count} (${pct}%)`);
  }

  if (applyMode) {
    // Apply suggestions to question bank
    const updated = items.map((item) => {
      const suggestion = suggestions.get(item.id);
      if (suggestion && !item.bloomsLevel) {
        return { ...item, bloomsLevel: suggestion.level };
      }
      return item;
    });

    saveQuestionBank(updated);
    console.log(`\nApplied ${suggestions.size} suggestions to question-bank.json`);
    console.log('Review and edit levels in the JSON file or via the admin UI.');
  } else {
    console.log('\nTo apply suggestions, run:');
    console.log('  pnpm tsx scripts/classify-blooms.ts --apply');
    console.log('\nOr review and edit blooms-suggestions.csv first.');
  }
}

main();
