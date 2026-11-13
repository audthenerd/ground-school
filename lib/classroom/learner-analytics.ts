/**
 * Client-side learner analytics: scene visit dwell + quiz score reporting.
 * All network calls are fire-and-forget; failures never break classroom UX.
 */

import type { QuestionResult } from '@/lib/quiz/grading';

const VISIT_URL = '/api/classroom/analytics/visit';
const QUIZ_SCORE_URL = '/api/classroom/analytics/quiz-score';

function postJson(url: string, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // best-effort
  });
}

export interface ActiveSceneVisit {
  visitId: string;
  stageId: string;
  sceneId: string;
}

/** Mint a visit id the client can correlate with enter/leave. */
export function mintVisitId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function reportSceneVisitEnter(input: {
  visitId: string;
  stageId: string;
  sceneId: string;
  sceneType?: string | null;
}): void {
  postJson(VISIT_URL, {
    action: 'enter',
    visitId: input.visitId,
    stageId: input.stageId,
    sceneId: input.sceneId,
    sceneType: input.sceneType ?? null,
  });
}

export function reportSceneVisitLeave(visitId: string): void {
  postJson(VISIT_URL, {
    action: 'leave',
    visitId,
  });
}

export function reportQuizScore(input: {
  stageId: string;
  sceneId: string;
  attemptId: string;
  earned: number;
  total: number;
  results: QuestionResult[];
}): void {
  postJson(QUIZ_SCORE_URL, {
    stageId: input.stageId,
    sceneId: input.sceneId,
    attemptId: input.attemptId,
    earned: input.earned,
    total: input.total,
    results: input.results,
  });
}
