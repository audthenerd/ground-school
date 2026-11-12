/**
 * POST /api/admin/curriculum/rsaf-commands/candidates — start N candidate runs.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { createCurriculumCandidates } from '@/lib/ground-school/curriculum-service';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { createLogger } from '@/lib/logger';

const log = createLogger('AdminCurriculumCandidates');

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    let count: number | undefined;
    try {
      const body = (await req.json()) as { count?: unknown };
      if (body.count !== undefined) {
        if (typeof body.count !== 'number' || !Number.isFinite(body.count)) {
          return NextResponse.json(
            { error: 'invalid_count' },
            { status: 400, headers: responseHeaders },
          );
        }
        count = body.count;
      }
    } catch {
      // Empty body → default count.
    }

    try {
      const result = await createCurriculumCandidates({
        principal,
        request: req,
        count,
      });
      return NextResponse.json(result, { status: 202, headers: responseHeaders });
    } catch (error) {
      const coded = error as { code?: string; status?: number; message?: string; name?: string };
      if (
        coded.name === 'CurriculumModelRefusal' ||
        coded.name === 'CurriculumInputError' ||
        coded.name === 'CurriculumStartRefusal'
      ) {
        return NextResponse.json(
          { error: coded.code ?? 'invalid_request', message: coded.message },
          { status: coded.status ?? 400, headers: responseHeaders },
        );
      }
      log.error('Failed to create curriculum candidates', error);
      return NextResponse.json(
        { error: 'internal_error' },
        { status: 500, headers: responseHeaders },
      );
    }
  });
}
