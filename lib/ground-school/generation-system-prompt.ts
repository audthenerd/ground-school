/**
 * Ground School generation system brief.
 *
 * Owns the shared RSAF ops-immersion rules for outline, agent profiles,
 * scene content/actions, PBL, quiz grading, and classroom chat. Edit
 * `generation-system-prompt.md` beside this file; the next generation call
 * picks up the change (no server restart required in local/dev file reads).
 *
 * Outline / slide stages optionally attach question-bank learning objectives
 * so slides teach facts needed to answer those items.
 */

import fs from 'fs';
import path from 'path';

import { formatQuestionBankObjectives } from '@/lib/ground-school/question-bank';

const PROMPT_FILENAME = 'generation-system-prompt.md';

/** Header prepended so stage-specific instructions remain distinct. */
const BRIEF_HEADER = `# Ground School domain brief (overrides conflicting instructions below)

The following brief applies to this generation stage. Where it conflicts with
later instructions — especially about inventing facts, audience, agents, quiz
scoring, or Bloom levels — this brief wins.

`;

export interface GenerationPromptOptions {
  /**
   * When set, append question-bank learning objectives for these topics.
   * Omit for chat / agent-profiles / PBL / quiz-grade (brief only).
   */
  questionBankTopics?: readonly string[];
}

function promptPath(): string {
  return path.join(process.cwd(), 'lib', 'ground-school', PROMPT_FILENAME);
}

/**
 * Load the full generation system brief from disk.
 * Throws if the file is missing — generation must not run without it.
 */
export function loadGenerationSystemPrompt(): string {
  return fs.readFileSync(promptPath(), 'utf-8').trim();
}

/**
 * Prepend the Ground School domain brief to a stage-specific system prompt.
 * Optionally attach question-bank objectives (outline / slide stages).
 * Stage contracts (JSON schemas, tool protocols) stay after the brief.
 */
export function withGenerationSystemPrompt(
  stageSystemPrompt: string,
  options?: GenerationPromptOptions,
): string {
  const brief = loadGenerationSystemPrompt();
  const bank = options?.questionBankTopics?.length
    ? `\n\n---\n\n${formatQuestionBankObjectives(options.questionBankTopics)}`
    : '';
  const stage = stageSystemPrompt.trim();
  const head = `${BRIEF_HEADER}${brief}${bank}`;
  if (!stage) return head;
  return `${head}\n\n---\n\n# Stage-specific instructions\n\n${stage}`;
}
