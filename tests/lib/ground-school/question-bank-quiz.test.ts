import { describe, expect, it } from 'vitest';

import {
  bankItemToQuizQuestion,
  sampleBankItemsForQuiz,
  sampleQuizQuestionsFromBank,
} from '@/lib/ground-school/question-bank-quiz';
import {
  filterQuestionBank,
  parseQuestionBankCsv,
  type QuestionBankItem,
} from '@/lib/ground-school/question-bank';

describe('bankItemToQuizQuestion', () => {
  it('maps Radio options to lettered answers', () => {
    const item: QuestionBankItem = {
      id: 'Q001',
      question: 'Which command?',
      fieldType: 'Radio',
      options: ['ACC', 'ADOC', 'APGC', 'AFTC'],
      correctAnswer: 'ACC',
      explanation: 'ACC flies combat',
      topic: 'RSAF Commands',
      subtopic: 'Air Combat Command',
      difficulty: '1.0',
      status: 'Draft',
      source: 'rsaf.gov.sg',
    };
    const q = bankItemToQuizQuestion(item);
    expect(q.type).toBe('single');
    expect(q.options?.map((o) => o.value)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.answer).toEqual(['A']);
    expect(q.analysis).toBe('ACC flies combat');
  });

  it('maps Yes/No numeric answers', () => {
    const item: QuestionBankItem = {
      id: 'Q002',
      question: 'ADOC is 24/7?',
      fieldType: 'Yes/No',
      options: ['True', 'False'],
      correctAnswer: '1',
      explanation: 'Ops centre is continuous',
      topic: 'RSAF Commands',
      subtopic: 'ADOC',
      difficulty: '1.0',
      status: 'Draft',
      source: 'rsaf.gov.sg',
    };
    const q = bankItemToQuizQuestion(item);
    expect(q.answer).toEqual(['A']);
  });
});

describe('sampleQuizQuestionsFromBank', () => {
  it('samples a deterministic set of 20 RSAF Commands items', () => {
    const a = sampleQuizQuestionsFromBank({ seed: 'run-1', count: 20 });
    const b = sampleQuizQuestionsFromBank({ seed: 'run-1', count: 20 });
    const c = sampleQuizQuestionsFromBank({ seed: 'run-2', count: 20 });
    expect(a).toHaveLength(20);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a.map((q) => q.id)).not.toEqual(c.map((q) => q.id));
    expect(filterQuestionBank(['RSAF Commands']).length).toBeGreaterThanOrEqual(20);
  });

  it('prefers choice questions when sampling', () => {
    const items = sampleBankItemsForQuiz({ seed: 'prefer-choice', count: 20 });
    expect(items.every((item) => item.fieldType.toLowerCase() !== 'long answer')).toBe(true);
  });
});

describe('parseQuestionBankCsv', () => {
  it('parses a minimal Sheets export', () => {
    const csv = [
      'ID,Question,Field Type,Options,Correct Answer,Explanation,Topic,Subtopic,Difficulty,Status,Source',
      'Q900,Which?,Radio,A|B|C|D,A,Because,RSAF Commands,ACC,1.0,Draft,test.source',
    ].join('\n');
    const items = parseQuestionBankCsv(csv);
    expect(items).toHaveLength(1);
    expect(items[0]?.options).toEqual(['A', 'B', 'C', 'D']);
  });

  it('rejects a choice answer missing from options', () => {
    const csv = [
      'ID,Question,Field Type,Options,Correct Answer,Explanation,Topic,Subtopic,Difficulty,Status,Source',
      'Q901,Which?,Radio,A|B,Z,Because,RSAF Commands,ACC,1.0,Draft,test.source',
    ].join('\n');
    expect(() => parseQuestionBankCsv(csv)).toThrow(/not present in Options/);
  });
});
