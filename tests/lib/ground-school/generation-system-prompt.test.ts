import { describe, expect, it } from 'vitest';

import {
  loadGenerationSystemPrompt,
  withGenerationSystemPrompt,
} from '@/lib/ground-school/generation-system-prompt';
import {
  DEFAULT_SORTIE_TOPICS,
  filterQuestionBank,
  formatQuestionBankObjectives,
  loadQuestionBank,
} from '@/lib/ground-school/question-bank';

describe('generation system prompt', () => {
  it('loads the Ground School domain brief from disk', () => {
    const brief = loadGenerationSystemPrompt();
    expect(brief).toContain('AUDIENCE');
    expect(brief).toContain('software engineers');
    expect(brief).toContain('RSAF');
    expect(brief).toContain('Never invent');
    expect(brief).toContain('Instructor');
    expect(brief).toContain('Wingman');
    expect(brief).toContain('QUESTION-BANK-DRIVEN LESSONS');
  });

  it('prepends the brief without the bank dump unless topics are requested', () => {
    const combined = withGenerationSystemPrompt('Return ONLY valid JSON.');
    expect(combined).toContain('Ground School domain brief');
    expect(combined).toContain('Return ONLY valid JSON.');
    expect(combined).not.toContain('Items in this sortie:');
    expect(combined).not.toContain('Target answer:');
  });

  it('attaches question-bank objectives for outline/slide stages', () => {
    const combined = withGenerationSystemPrompt('Return ONLY valid JSON.', {
      questionBankTopics: DEFAULT_SORTIE_TOPICS,
    });
    expect(combined.indexOf('Ground School domain brief')).toBeLessThan(
      combined.indexOf('Items in this sortie:'),
    );
    expect(combined.indexOf('Items in this sortie:')).toBeLessThan(
      combined.indexOf('Stage-specific instructions'),
    );
    expect(combined).toContain('Q001');
    expect(combined).toContain('Air Combat Command');
    expect(combined).toContain('Target answer:');
  });
});

describe('question bank', () => {
  it('loads the exported bank', () => {
    const bank = loadQuestionBank();
    expect(bank.length).toBeGreaterThan(100);
    expect(bank[0]?.id).toMatch(/^Q\d+/);
  });

  it('defaults the Enter Classroom sortie to RSAF Commands', () => {
    expect([...DEFAULT_SORTIE_TOPICS]).toEqual(['RSAF Commands']);
    const commands = filterQuestionBank(DEFAULT_SORTIE_TOPICS);
    expect(commands.every((item) => item.topic === 'RSAF Commands')).toBe(true);
    expect(commands.length).toBeGreaterThan(20);
  });

  it('formats teachable objectives with answers and sources', () => {
    const md = formatQuestionBankObjectives(['RSAF Commands']);
    expect(md).toContain('Q001');
    expect(md).toContain('Teach:');
    expect(md).toContain('Target answer:');
    expect(md).toContain('Source:');
    expect(md).toContain('unlocks');
  });
});
