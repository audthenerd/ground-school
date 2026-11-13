/**
 * DELETE /api/admin/curriculum/rsaf-commands/candidates/[id]
 * Remove a candidate classroom (and clear live release if it pointed here).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  CurriculumDeleteError,
  deleteCurriculumCandidate,
} from '@/lib/ground-school/curriculum-service';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { createLogger } from '@/lib/logger';

const log = createLogger('AdminCurriculumDeleteCandidate');

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    const { id } = await params;
    const candidateId = id?.trim();
    if (!candidateId) {
      return NextResponse.json(
        { error: 'missing_candidate_id' },
        { status: 400, headers: responseHeaders },
      );
    }

    try {
      const result = await deleteCurriculumCandidate({ candidateId });
      return NextResponse.json({ ok: true, ...result }, { status: 200, headers: responseHeaders });
    } catch (error) {
      if (error instanceof CurriculumDeleteError) {
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status: 404, headers: responseHeaders },
        );
      }
      log.error('Failed to delete curriculum candidate', error);
      return NextResponse.json(
        { error: 'internal_error' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
