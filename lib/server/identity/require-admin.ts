/**
 * Admin gate for routes and server checks.
 *
 * Admins are env-allowlisted Google sessions that carry `OWNER_ROLES.admin`
 * (see `admin-emails.ts` + Google session auth). Students are ordinary
 * authenticated users without that role.
 */
import { NextResponse } from 'next/server';

import { OWNER_ROLES, principalHasRole, type OwnerPrincipal } from '@/lib/server/identity/types';

/** Whether this principal may use administrative surfaces. */
export function isAdminPrincipal(principal: OwnerPrincipal): boolean {
  return principalHasRole(principal, OWNER_ROLES.admin);
}

/** 403 JSON body used by admin APIs when the caller lacks `admin`. */
export function adminForbiddenResponse(responseHeaders?: Headers): NextResponse {
  return NextResponse.json(
    { error: 'forbidden' },
    { status: 403, ...(responseHeaders ? { headers: responseHeaders } : {}) },
  );
}
