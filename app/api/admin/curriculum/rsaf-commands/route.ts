/**
 * GET /api/admin/curriculum/rsaf-commands — overview of candidates + live release.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  CURRICULUM_SLOT_RSAF_COMMANDS,
  getCurriculumOverview,
} from '@/lib/ground-school/curriculum-service';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }
    const overview = await getCurriculumOverview(CURRICULUM_SLOT_RSAF_COMMANDS);
    return NextResponse.json(overview, { status: 200, headers: responseHeaders });
  });
}
