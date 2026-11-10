/**
 * POST /api/admin/curriculum/rsaf-commands/approve — publish one candidate as the live classroom.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  approveCurriculumRelease,
  CurriculumApproveError,
} from '@/lib/ground-school/curriculum-service';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { createLogger } from '@/lib/logger';

const log = createLogger('AdminCurriculumApprove');

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    let candidateId: string | undefined;
    try {
      const body = (await req.json()) as { candidateId?: unknown };
      if (typeof body.candidateId === 'string' && body.candidateId.trim()) {
        candidateId = body.candidateId.trim();
      }
    } catch {
      /* invalid json */
    }
    if (!candidateId) {
      return NextResponse.json(
        { error: 'missing_candidate_id' },
        { status: 400, headers: responseHeaders },
      );
    }

    try {
      const release = await approveCurriculumRelease({
        candidateId,
        approvedBy: principal.ownerId,
      });
      return NextResponse.json({ release }, { status: 200, headers: responseHeaders });
    } catch (error) {
      if (error instanceof CurriculumApproveError) {
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status: error.code === 'not_found' ? 404 : 409, headers: responseHeaders },
        );
      }
      log.error('Failed to approve curriculum candidate', error);
      return NextResponse.json(
        { error: 'internal_error' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
