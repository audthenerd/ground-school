/**
 * Import a Google Sheets CSV export into lib/ground-school/question-bank.json.
 *
 * Usage:
 *   pnpm sync:question-bank -- path/to/export.csv
 *
 * Sheet:
 *   https://docs.google.com/spreadsheets/d/1r2f6gbMba1HwWHBKGs_A-A5QEXdhSkwAF3ZzdZ9uQFc
 *   File → Download → Comma Separated Values (.csv)
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseQuestionBankCsv, saveQuestionBank } from '../lib/ground-school/question-bank';

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const csvPath = args[0];
  if (!csvPath) {
    console.error('Usage: pnpm sync:question-bank -- path/to/export.csv');
    process.exit(1);
  }
  const absolute = path.resolve(csvPath);
  if (!fs.existsSync(absolute)) {
    console.error(`File not found: ${absolute}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(absolute, 'utf-8');
  const items = parseQuestionBankCsv(csv);
  saveQuestionBank(items);
  console.log(`Wrote ${items.length} questions to lib/ground-school/question-bank.json`);
}

main();
