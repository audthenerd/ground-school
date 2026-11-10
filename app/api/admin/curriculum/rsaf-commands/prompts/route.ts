/**
 * GET /api/admin/curriculum/rsaf-commands/prompts — student prompts on the live release.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { listClassroomPrompts } from '@/lib/persistence/classroom-prompts';
import {
  CURRICULUM_SLOT_RSAF_COMMANDS,
  getCurriculumRelease,
} from '@/lib/persistence/curriculum';
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
        { prompts: [], total: 0, stageId: null },
        { status: 200, headers: responseHeaders },
      );
    }

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const ownerId = url.searchParams.get('ownerId') ?? undefined;

    const { prompts, total } = await listClassroomPrompts({
      stageId: release.stageId,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
      ownerId,
    });

    return NextResponse.json(
      {
        stageId: release.stageId,
        total,
        prompts: prompts.map((p) => ({
          id: p.id,
          stageId: p.stageId,
          ownerId: p.ownerId,
          sceneId: p.sceneId,
          chatSessionId: p.chatSessionId,
          promptText: p.promptText,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      { status: 200, headers: responseHeaders },
    );
  });
}
