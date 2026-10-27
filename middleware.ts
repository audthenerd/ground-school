import { NextRequest, NextResponse } from 'next/server';

import { isAgentRuntimeConfigured, isProWorkbenchEnabled } from '@/lib/config/feature-flags';
import { verifyAccessTokenEdge } from '@/lib/server/access-token-edge';
import { isGoogleAuthConfigured } from '@/lib/server/identity/host/google-auth-config';
import { verifyGoogleSessionTokenEdge } from '@/lib/server/identity/host/google-session-edge';
import { GOOGLE_SESSION_COOKIE } from '@/lib/server/identity/host/google-session-shared';
import {
  anonymousOwnerForNavigation,
  type NavigationIdentity,
} from '@/lib/server/identity/navigation';

/**
 * Let the request through, carrying the anonymous owner a page request
 * establishes: the cookie is set on the page response, and the forwarded
 * request carries it too, so the page and every request it sends resolve one
 * owner (see `lib/server/identity/navigation.ts`).
 */
function next(request: NextRequest, identity: NavigationIdentity | undefined): NextResponse {
  if (!identity) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('cookie', identity.requestCookie);
  const response = NextResponse.next({ request: { headers } });
  response.headers.append('set-cookie', identity.setCookie);
  return response;
}

/** Same-origin relative path only — blocks open redirects via `?next=`. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/';
  }
  return raw;
}

function isGoogleAuthPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/access-code/') ||
    pathname === '/api/health'
  );
}

function navigationIdentity(
  request: NextRequest,
  options: { skipPremint: boolean },
): NavigationIdentity | undefined {
  if (options.skipPremint) return undefined;
  // Skip premint when a Google session cookie is already present (signed-in
  // users should not mint a fresh claim candidate on every document load).
  if (request.cookies.has(GOOGLE_SESSION_COOKIE)) return undefined;
  return anonymousOwnerForNavigation({
    method: request.method,
    headers: request.headers,
    pathname: request.nextUrl.pathname,
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Return an actual server-side 404 when either half of the workbench is off.
  // Edge middleware cannot reliably inspect server-only deployment variables,
  // so it enforces the public gate and leaves the complete runtime/database
  // check to Node. A Node-hosted middleware uses the same gate as startup.
  const canInspectServerRuntime = process.env.NEXT_RUNTIME !== 'edge';
  const workbenchEnabled =
    isProWorkbenchEnabled() && (!canInspectServerRuntime || isAgentRuntimeConfigured());
  if (!workbenchEnabled && (pathname === '/workbench' || pathname.startsWith('/workbench/'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode) {
    // Whitelist: access-code endpoints, health check, Google OAuth
    const accessPublic =
      pathname.startsWith('/api/access-code/') ||
      pathname.startsWith('/api/auth/') ||
      pathname === '/api/health';

    if (!accessPublic) {
      const cookie = request.cookies.get('openmaic_access');
      const accessOk =
        !!cookie?.value && (await verifyAccessTokenEdge(cookie.value, accessCode));
      if (!accessOk) {
        // API requests without valid cookie → 401
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
            { status: 401 },
          );
        }
        // Page requests → let through for the access-code modal; Google gate
        // below may still redirect unsigned users to /login.
      }
    }
  }

  // Require a valid Google session when OAuth env is fully configured.
  if (isGoogleAuthConfigured()) {
    const sessionSecret = process.env.AUTH_SESSION_SECRET?.trim() ?? '';
    const token = request.cookies.get(GOOGLE_SESSION_COOKIE)?.value;
    const session = await verifyGoogleSessionTokenEdge(token, sessionSecret);

    if (pathname === '/login') {
      if (session) {
        const dest = safeReturnPath(request.nextUrl.searchParams.get('next'));
        return NextResponse.redirect(new URL(dest, request.url));
      }
      // Public login page — no anonymous claim mint.
      return NextResponse.next();
    }

    if (!session && !isGoogleAuthPublicPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, errorCode: 'UNAUTHORIZED', error: 'Sign in required' },
          { status: 401 },
        );
      }
      const login = new URL('/login', request.url);
      const returnPath = `${pathname}${request.nextUrl.search}`;
      if (returnPath !== '/') {
        login.searchParams.set('next', returnPath);
      }
      return NextResponse.redirect(login);
    }
  }

  const identity = navigationIdentity(request, {
    skipPremint: pathname === '/login',
  });
  return next(request, identity);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
