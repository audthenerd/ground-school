/**
 * POST /api/classroom/analytics/quiz-score — record a reviewed quiz score for
 * the request owner. Best-effort; must not break quiz UX if persistence fails.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { appendClassroomQuizScore } from '@/lib/persistence/classroom-quiz-scores';
import type { QuestionResult } from '@/lib/quiz/grading';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readResults(value: unknown): QuestionResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is QuestionResult => {
    if (typeof item !== 'object' || item === null) return false;
    const row = item as Record<string, unknown>;
    return typeof row.questionId === 'string' && typeof row.earned === 'number';
  });
}

export async function POST(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json' },
        { status: 400, headers: responseHeaders },
      );
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json(
        { error: 'invalid_body' },
        { status: 400, headers: responseHeaders },
      );
    }

    const record = body as Record<string, unknown>;
    const stageId = readString(record.stageId);
    const sceneId = readString(record.sceneId);
    const attemptId = readString(record.attemptId);
    const earned = readNumber(record.earned);
    const total = readNumber(record.total);
    const results = readResults(record.results);

    if (!stageId || !sceneId || !attemptId || earned == null || total == null) {
      return NextResponse.json(
        { error: 'missing_fields' },
        { status: 400, headers: responseHeaders },
      );
    }

    try {
      const score = await appendClassroomQuizScore({
        stageId,
        ownerId: principal.ownerId,
        sceneId,
        attemptId,
        earned,
        total,
        results,
      });
      return NextResponse.json(
        { id: score.id, createdAt: score.createdAt.toISOString() },
        { status: 200, headers: responseHeaders },
      );
    } catch (error) {
      console.warn('[classroom-analytics] quiz score failed', error);
      return NextResponse.json(
        { error: 'persist_failed' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
