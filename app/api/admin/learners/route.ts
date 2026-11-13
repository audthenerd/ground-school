/**
 * GET /api/admin/learners — learner activity on the live curriculum release.
 *
 * Without `ownerId`: summary rows for every learner with visits, scores, or prompts.
 * With `ownerId`: that learner's merged chronological timeline.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildLearnerSummaries, mergeLearnerTimeline } from '@/lib/admin/learner-timeline';
import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  listClassroomPrompts,
  summarizeClassroomPrompts,
} from '@/lib/persistence/classroom-prompts';
import {
  listClassroomQuizScores,
  summarizeClassroomQuizScores,
} from '@/lib/persistence/classroom-quiz-scores';
import {
  listClassroomSceneVisits,
  summarizeClassroomSceneVisits,
} from '@/lib/persistence/classroom-scene-visits';
import { CURRICULUM_SLOT_RSAF_COMMANDS, getCurriculumRelease } from '@/lib/persistence/curriculum';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    const release = await getCurriculumRelease(CURRICULUM_SLOT_RSAF_COMMANDS);
    if (!release) {
      return NextResponse.json(
        { stageId: null, learners: [], timeline: [], total: 0 },
        { status: 200, headers: responseHeaders },
      );
    }

    const url = new URL(req.url);
    const ownerId = url.searchParams.get('ownerId') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const safeLimit = Number.isFinite(limit) ? limit : 100;
    const safeOffset = Number.isFinite(offset) ? offset : 0;

    if (ownerId) {
      const [visits, scores, prompts] = await Promise.all([
        listClassroomSceneVisits({
          stageId: release.stageId,
          ownerId,
          limit: safeLimit,
          offset: safeOffset,
        }),
        listClassroomQuizScores({
          stageId: release.stageId,
          ownerId,
          limit: safeLimit,
          offset: safeOffset,
        }),
        listClassroomPrompts({
          stageId: release.stageId,
          ownerId,
          limit: safeLimit,
          offset: safeOffset,
        }),
      ]);

      const timeline = mergeLearnerTimeline({
        visits: visits.visits,
        scores: scores.scores,
        prompts: prompts.prompts,
      });

      return NextResponse.json(
        {
          stageId: release.stageId,
          ownerId,
          timeline,
          totals: {
            visits: visits.total,
            scores: scores.total,
            prompts: prompts.total,
          },
        },
        { status: 200, headers: responseHeaders },
      );
    }

    const [visits, scores, prompts] = await Promise.all([
      summarizeClassroomSceneVisits({ stageId: release.stageId }),
      summarizeClassroomQuizScores({ stageId: release.stageId }),
      summarizeClassroomPrompts({ stageId: release.stageId }),
    ]);

    const learners = buildLearnerSummaries({ visits, scores, prompts });

    return NextResponse.json(
      {
        stageId: release.stageId,
        learners,
        total: learners.length,
      },
      { status: 200, headers: responseHeaders },
    );
  });
}
