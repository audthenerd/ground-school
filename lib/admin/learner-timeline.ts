/**
 * Merge visit / quiz-score / prompt rows into a single chronological timeline
 * for the admin learners view.
 */
import type { ClassroomPromptRow } from '@/lib/persistence/classroom-prompts';
import type { ClassroomQuizScoreRow } from '@/lib/persistence/classroom-quiz-scores';
import type { ClassroomSceneVisitRow } from '@/lib/persistence/classroom-scene-visits';

export type LearnerTimelineEvent =
  | {
      kind: 'visit';
      id: string;
      at: string;
      sceneId: string;
      sceneType: string | null;
      enteredAt: string;
      leftAt: string | null;
      durationMs: number | null;
    }
  | {
      kind: 'quiz_score';
      id: string;
      at: string;
      sceneId: string;
      attemptId: string;
      earned: number;
      total: number;
      /** Per-Bloom's-level breakdown of scores. */
      bloomsBreakdown?: BloomsScoreBreakdown;
    }
  | {
      kind: 'prompt';
      id: string;
      at: string;
      sceneId: string | null;
      promptText: string;
    };

/** Score breakdown by Bloom's taxonomy level. */
export interface BloomsScoreBreakdown {
  remember?: { earned: number; total: number };
  understand?: { earned: number; total: number };
  apply?: { earned: number; total: number };
  analyze?: { earned: number; total: number };
  evaluate?: { earned: number; total: number };
  create?: { earned: number; total: number };
  unclassified?: { earned: number; total: number };
}

export interface LearnerSummary {
  ownerId: string;
  visitCount: number;
  totalDwellMs: number;
  quizCount: number;
  latestQuizEarned: number | null;
  latestQuizTotal: number | null;
  promptCount: number;
  lastActiveAt: string | null;
}

export function mergeLearnerTimeline(input: {
  visits: ClassroomSceneVisitRow[];
  scores: ClassroomQuizScoreRow[];
  prompts: ClassroomPromptRow[];
}): LearnerTimelineEvent[] {
  const events: LearnerTimelineEvent[] = [];

  for (const visit of input.visits) {
    events.push({
      kind: 'visit',
      id: visit.id,
      at: visit.enteredAt.toISOString(),
      sceneId: visit.sceneId,
      sceneType: visit.sceneType,
      enteredAt: visit.enteredAt.toISOString(),
      leftAt: visit.leftAt?.toISOString() ?? null,
      durationMs: visit.durationMs,
    });
  }

  for (const score of input.scores) {
    events.push({
      kind: 'quiz_score',
      id: score.id,
      at: score.createdAt.toISOString(),
      sceneId: score.sceneId,
      attemptId: score.attemptId,
      earned: score.earned,
      total: score.total,
      bloomsBreakdown: computeBloomsBreakdown(score.results),
    });
  }

  function computeBloomsBreakdown(
    results: Array<{ earned: number; bloomsLevel?: string }>,
  ): BloomsScoreBreakdown | undefined {
    if (!results || results.length === 0) return undefined;

    const breakdown: BloomsScoreBreakdown = {};
    for (const result of results) {
      const level = result.bloomsLevel ?? 'unclassified';
      const key = level as keyof BloomsScoreBreakdown;
      if (!breakdown[key]) {
        breakdown[key] = { earned: 0, total: 0 };
      }
      breakdown[key]!.earned += result.earned;
      breakdown[key]!.total += 1;
    }

    return Object.keys(breakdown).length > 0 ? breakdown : undefined;
  }

  for (const prompt of input.prompts) {
    events.push({
      kind: 'prompt',
      id: prompt.id,
      at: prompt.createdAt.toISOString(),
      sceneId: prompt.sceneId,
      promptText: prompt.promptText,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events;
}

export function buildLearnerSummaries(input: {
  visits: Array<{
    ownerId: string;
    visitCount: number;
    totalDwellMs: number;
    lastEnteredAt: Date;
  }>;
  scores: Array<{
    ownerId: string;
    quizCount: number;
    latestEarned: number;
    latestTotal: number;
    latestAt: Date;
  }>;
  prompts: Array<{
    ownerId: string;
    promptCount: number;
    lastPromptAt: Date;
  }>;
}): LearnerSummary[] {
  const byOwner = new Map<string, LearnerSummary>();

  const ensure = (ownerId: string): LearnerSummary => {
    let row = byOwner.get(ownerId);
    if (!row) {
      row = {
        ownerId,
        visitCount: 0,
        totalDwellMs: 0,
        quizCount: 0,
        latestQuizEarned: null,
        latestQuizTotal: null,
        promptCount: 0,
        lastActiveAt: null,
      };
      byOwner.set(ownerId, row);
    }
    return row;
  };

  const bumpLast = (row: LearnerSummary, at: Date) => {
    const iso = at.toISOString();
    if (!row.lastActiveAt || iso > row.lastActiveAt) row.lastActiveAt = iso;
  };

  for (const visit of input.visits) {
    const row = ensure(visit.ownerId);
    row.visitCount = visit.visitCount;
    row.totalDwellMs = visit.totalDwellMs;
    bumpLast(row, visit.lastEnteredAt);
  }

  for (const score of input.scores) {
    const row = ensure(score.ownerId);
    row.quizCount = score.quizCount;
    row.latestQuizEarned = score.latestEarned;
    row.latestQuizTotal = score.latestTotal;
    bumpLast(row, score.latestAt);
  }

  for (const prompt of input.prompts) {
    const row = ensure(prompt.ownerId);
    row.promptCount = prompt.promptCount;
    bumpLast(row, prompt.lastPromptAt);
  }

  return Array.from(byOwner.values()).sort((a, b) => {
    const aAt = a.lastActiveAt ?? '';
    const bAt = b.lastActiveAt ?? '';
    return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
  });
}
