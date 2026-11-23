/**
 * GET /api/curriculum/rsaf-commands — approved shared classroom(s) by level.
 *
 * Query: `?level=L1|L2|L3` returns that level's stage (default L1).
 * Without a filter, returns all approved releases plus the L1 stageId for
 * backward compatibility.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { isAssessmentLevel, type AssessmentLevel } from '@/lib/ground-school/assessment-level';
import {
  getPublicCurriculumReleases,
  getPublicCurriculumStageId,
} from '@/lib/ground-school/curriculum-service';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isServerPersistenceConfigured()) {
    return NextResponse.json(
      { available: false, stageId: null, releases: [] },
      { status: 200 },
    );
  }

  return withRequestOwner(req, async (_principal, responseHeaders) => {
    const levelParam = req.nextUrl.searchParams.get('level');
    if (levelParam && !isAssessmentLevel(levelParam)) {
      return NextResponse.json(
        { error: 'invalid_level' },
        { status: 400, headers: responseHeaders },
      );
    }

    const level: AssessmentLevel = isAssessmentLevel(levelParam) ? levelParam : 'L1';
    const [stageId, releases] = await Promise.all([
      getPublicCurriculumStageId(undefined, level),
      getPublicCurriculumReleases(),
    ]);

    return NextResponse.json(
      {
        available: stageId !== null || releases.length > 0,
        stageId,
        level,
        releases: releases.map((r) => ({
          assessmentLevel: r.assessmentLevel,
          stageId: r.stageId,
          approvedAt: r.approvedAt,
        })),
      },
      { status: 200, headers: responseHeaders },
    );
  });
}
