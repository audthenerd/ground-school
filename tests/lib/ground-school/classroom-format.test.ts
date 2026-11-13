import { describe, expect, it } from 'vitest';

import {
  isSortieOutlineShape,
  normalizeSortieOutlines,
  SORTIE_QUIZ_QUESTION_COUNT,
  SORTIE_TOTAL_SCENES,
} from '@/lib/ground-school/classroom-format';
import type { SceneOutline } from '@/lib/types/generation';

function slide(id: string, order: number): SceneOutline {
  return {
    id,
    type: 'slide',
    title: id,
    description: 'desc',
    keyPoints: ['a', 'b', 'c'],
    order,
  };
}

describe('normalizeSortieOutlines', () => {
  it('repairs a short outline into 9 slide + 1 interactive + 1 quiz/20', () => {
    const raw: SceneOutline[] = [
      slide('s1', 1),
      slide('s2', 2),
      {
        id: 'q1',
        type: 'quiz',
        title: 'Quiz',
        description: 'practice',
        keyPoints: ['k'],
        order: 3,
        quizConfig: { questionCount: 3, difficulty: 'easy', questionTypes: ['single'] },
      },
    ];
    const normalized = normalizeSortieOutlines(raw);
    expect(normalized).toHaveLength(SORTIE_TOTAL_SCENES);
    expect(isSortieOutlineShape(normalized)).toBe(true);
    expect(normalized.filter((o) => o.type === 'slide')).toHaveLength(9);
    expect(normalized.filter((o) => o.type === 'interactive')).toHaveLength(1);
    expect(normalized.at(-1)?.type).toBe('quiz');
    expect(normalized.at(-1)?.title.toLowerCase()).not.toContain('practice');
    expect(normalized.at(-1)?.quizConfig?.questionCount).toBe(SORTIE_QUIZ_QUESTION_COUNT);
  });

  it('strips practice from quiz titles', () => {
    const normalized = normalizeSortieOutlines([
      {
        id: 'q',
        type: 'quiz',
        title: 'RSAF Commands Practice Quiz',
        description: 'A practice check',
        keyPoints: ['Practice only'],
        order: 1,
        quizConfig: { questionCount: 20, difficulty: 'medium', questionTypes: ['single'] },
      },
    ]);
    expect(normalized.at(-1)?.title).toBe('RSAF Commands Quiz');
    expect(normalized.at(-1)?.description.toLowerCase()).not.toContain('practice');
  });

  it('keeps interactive and forces quiz last', () => {
    const raw: SceneOutline[] = [
      ...Array.from({ length: 9 }, (_, i) => slide(`s${i + 1}`, i + 1)),
      {
        id: 'quiz_mid',
        type: 'quiz',
        title: 'Early quiz',
        description: 'should move',
        keyPoints: ['k'],
        order: 10,
        quizConfig: { questionCount: 5, difficulty: 'medium', questionTypes: ['single'] },
      },
      {
        id: 'ix',
        type: 'interactive',
        title: 'Interactive',
        description: 'apply',
        keyPoints: ['a', 'b', 'c'],
        order: 11,
        widgetType: 'diagram',
        widgetOutline: { concept: 'commands', diagramType: 'hierarchy' },
      },
    ];
    const normalized = normalizeSortieOutlines(raw);
    expect(normalized[9]?.type).toBe('interactive');
    expect(normalized[9]?.id).toBe('ix');
    expect(normalized[10]?.type).toBe('quiz');
    expect(normalized[10]?.quizConfig?.questionCount).toBe(20);
  });
});
