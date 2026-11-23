/**
 * POST /api/admin/classroom/probe-results — upsert F2F probe evidence (admin only).
 * GET  /api/admin/classroom/probe-results?stageId=&sceneId=&learnerId= — load marks.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { OQ_DIMENSIONS, type OqDimension } from '@/lib/ground-school/assessment-level';
import {
  listClassroomProbeResultsForStageLearner,
  upsertClassroomProbeResults,
} from '@/lib/persistence/classroom-probe-results';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { createLogger } from '@/lib/logger';

const log = createLogger('AdminProbeResults');

export const runtime = 'nodejs';

function isDimension(value: unknown): value is OqDimension {
  return typeof value === 'string' && (OQ_DIMENSIONS as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }
    const stageId = req.nextUrl.searchParams.get('stageId')?.trim();
    const sceneId = req.nextUrl.searchParams.get('sceneId')?.trim();
    const learnerId = req.nextUrl.searchParams.get('learnerId')?.trim();
    if (!stageId || !sceneId || !learnerId) {
      return NextResponse.json(
        { error: 'missing_params' },
        { status: 400, headers: responseHeaders },
      );
    }
    const rows = await listClassroomProbeResultsForStageLearner({
      stageId,
      sceneId,
      learnerOwnerId: learnerId,
    });
    return NextResponse.json(
      {
        results: rows.map((row) => ({
          dimension: row.dimension,
          passed: row.passed,
          evidenceNote: row.evidenceNote,
          assessorId: row.assessorId,
          updatedAt: row.updatedAt.toISOString(),
        })),
      },
      { status: 200, headers: responseHeaders },
    );
  });
}

export async function POST(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    let body: {
      stageId?: unknown;
      sceneId?: unknown;
      learnerOwnerId?: unknown;
      assessmentLevel?: unknown;
      results?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: responseHeaders });
    }

    const stageId = typeof body.stageId === 'string' ? body.stageId.trim() : '';
    const sceneId = typeof body.sceneId === 'string' ? body.sceneId.trim() : '';
    const learnerOwnerId =
      typeof body.learnerOwnerId === 'string' ? body.learnerOwnerId.trim() : '';
    const assessmentLevel = body.assessmentLevel;
    if (
      !stageId ||
      !sceneId ||
      !learnerOwnerId ||
      (assessmentLevel !== 'L2' && assessmentLevel !== 'L3') ||
      !Array.isArray(body.results)
    ) {
      return NextResponse.json(
        { error: 'invalid_body' },
        { status: 400, headers: responseHeaders },
      );
    }

    const results: Array<{ dimension: OqDimension; passed: boolean; evidenceNote: string }> = [];
    for (const item of body.results) {
      if (!item || typeof item !== 'object') {
        return NextResponse.json(
          { error: 'invalid_result' },
          { status: 400, headers: responseHeaders },
        );
      }
      const row = item as Record<string, unknown>;
      if (
        !isDimension(row.dimension) ||
        typeof row.passed !== 'boolean' ||
        typeof row.evidenceNote !== 'string' ||
        !row.evidenceNote.trim()
      ) {
        return NextResponse.json(
          { error: 'invalid_result' },
          { status: 400, headers: responseHeaders },
        );
      }
      results.push({
        dimension: row.dimension,
        passed: row.passed,
        evidenceNote: row.evidenceNote.trim(),
      });
    }

    try {
      const saved = await upsertClassroomProbeResults({
        stageId,
        sceneId,
        learnerOwnerId,
        assessmentLevel,
        assessorId: principal.ownerId,
        results,
      });
      return NextResponse.json(
        {
          results: saved.map((row) => ({
            dimension: row.dimension,
            passed: row.passed,
            evidenceNote: row.evidenceNote,
            updatedAt: row.updatedAt.toISOString(),
          })),
        },
        { status: 200, headers: responseHeaders },
      );
    } catch (error) {
      log.error('Failed to upsert probe results', error);
      return NextResponse.json(
        { error: 'internal_error' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
