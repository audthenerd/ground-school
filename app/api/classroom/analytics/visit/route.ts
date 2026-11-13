/**
 * POST /api/classroom/analytics/visit — open or close a scene visit for the
 * request owner. Best-effort analytics; failures should not break navigation.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  closeClassroomSceneVisit,
  openClassroomSceneVisit,
} from '@/lib/persistence/classroom-scene-visits';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
    const action = readString(record.action);
    const stageId = readString(record.stageId);
    const sceneId = readString(record.sceneId);
    const sceneType = readString(record.sceneType);
    const visitId = readString(record.visitId);

    if (action === 'enter') {
      if (!stageId || !sceneId) {
        return NextResponse.json(
          { error: 'missing_fields' },
          { status: 400, headers: responseHeaders },
        );
      }
      try {
        const visit = await openClassroomSceneVisit({
          stageId,
          ownerId: principal.ownerId,
          sceneId,
          sceneType,
          visitId: visitId ?? undefined,
        });
        return NextResponse.json(
          { visitId: visit.id, enteredAt: visit.enteredAt.toISOString() },
          { status: 200, headers: responseHeaders },
        );
      } catch (error) {
        console.warn('[classroom-analytics] visit enter failed', error);
        return NextResponse.json(
          { error: 'persist_failed' },
          { status: 500, headers: responseHeaders },
        );
      }
    }

    if (action === 'leave') {
      if (!visitId) {
        return NextResponse.json(
          { error: 'missing_visit_id' },
          { status: 400, headers: responseHeaders },
        );
      }
      try {
        const visit = await closeClassroomSceneVisit({
          visitId,
          ownerId: principal.ownerId,
        });
        return NextResponse.json(
          {
            visitId,
            closed: visit != null,
            durationMs: visit?.durationMs ?? null,
          },
          { status: 200, headers: responseHeaders },
        );
      } catch (error) {
        console.warn('[classroom-analytics] visit leave failed', error);
        return NextResponse.json(
          { error: 'persist_failed' },
          { status: 500, headers: responseHeaders },
        );
      }
    }

    return NextResponse.json(
      { error: 'invalid_action' },
      { status: 400, headers: responseHeaders },
    );
  });
}
