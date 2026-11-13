import { describe, expect, it } from 'vitest';

import { buildLearnerSummaries, mergeLearnerTimeline } from '@/lib/admin/learner-timeline';

describe('mergeLearnerTimeline', () => {
  it('merges visits, scores, and prompts newest-first', () => {
    const timeline = mergeLearnerTimeline({
      visits: [
        {
          id: 'v1',
          stageId: 'stage',
          ownerId: 'u1',
          sceneId: 's1',
          sceneType: 'slide',
          enteredAt: new Date('2026-01-01T10:00:00Z'),
          leftAt: new Date('2026-01-01T10:01:00Z'),
          durationMs: 60_000,
        },
      ],
      scores: [
        {
          id: 'q1',
          stageId: 'stage',
          ownerId: 'u1',
          sceneId: 's2',
          attemptId: 'a1',
          earned: 2,
          total: 3,
          results: [],
          createdAt: new Date('2026-01-01T10:05:00Z'),
        },
      ],
      prompts: [
        {
          id: 'p1',
          stageId: 'stage',
          ownerId: 'u1',
          sceneId: 's1',
          chatSessionId: null,
          promptText: 'hello',
          createdAt: new Date('2026-01-01T10:02:00Z'),
        },
      ],
    });

    expect(timeline.map((e) => e.kind)).toEqual(['quiz_score', 'prompt', 'visit']);
    expect(timeline[0]).toMatchObject({ kind: 'quiz_score', earned: 2, total: 3 });
  });
});

describe('buildLearnerSummaries', () => {
  it('joins aggregates by owner and sorts by last activity', () => {
    const learners = buildLearnerSummaries({
      visits: [
        {
          ownerId: 'old',
          visitCount: 2,
          totalDwellMs: 1000,
          lastEnteredAt: new Date('2026-01-01T09:00:00Z'),
        },
        {
          ownerId: 'new',
          visitCount: 1,
          totalDwellMs: 500,
          lastEnteredAt: new Date('2026-01-01T12:00:00Z'),
        },
      ],
      scores: [
        {
          ownerId: 'new',
          quizCount: 1,
          latestEarned: 3,
          latestTotal: 3,
          latestAt: new Date('2026-01-01T11:00:00Z'),
        },
      ],
      prompts: [
        {
          ownerId: 'prompt-only',
          promptCount: 4,
          lastPromptAt: new Date('2026-01-01T10:00:00Z'),
        },
      ],
    });

    expect(learners.map((l) => l.ownerId)).toEqual(['new', 'prompt-only', 'old']);
    expect(learners[0]).toMatchObject({
      ownerId: 'new',
      visitCount: 1,
      quizCount: 1,
      latestQuizEarned: 3,
      latestQuizTotal: 3,
      promptCount: 0,
    });
    expect(learners[1]).toMatchObject({ ownerId: 'prompt-only', promptCount: 4 });
  });
});
