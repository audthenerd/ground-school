/**
 * GET /api/curriculum/rsaf-commands — stage id of the approved shared classroom.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { getPublicCurriculumStageId } from '@/lib/ground-school/curriculum-service';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isServerPersistenceConfigured()) {
    return NextResponse.json({ available: false, stageId: null }, { status: 200 });
  }

  return withRequestOwner(req, async (_principal, responseHeaders) => {
    const stageId = await getPublicCurriculumStageId();
    if (!stageId) {
      return NextResponse.json(
        { available: false, stageId: null },
        { status: 200, headers: responseHeaders },
      );
    }
    return NextResponse.json(
      { available: true, stageId },
      { status: 200, headers: responseHeaders },
    );
  });
}
