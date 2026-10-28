import { resolveGoogleAuthConfig } from '@/lib/server/identity/host/google-auth-config';
import {
  clearOAuthStateCookieHeader,
  decodeStateCookie,
  exchangeCodeForProfile,
  GOOGLE_OAUTH_STATE_COOKIE,
  GoogleOAuthError,
  sessionCookieForProfile,
} from '@/lib/server/identity/host/google-oauth';

export const runtime = 'nodejs';

function readCookie(request: Request, name: string): string | undefined {
  const encoded = request.headers.get('cookie');
  if (!encoded) return undefined;
  for (const item of encoded.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function redirectTo(
  configOrigin: string,
  path: string,
  query: Record<string, string>,
  setCookies: string[],
): Response {
  const url = new URL(path, configOrigin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const headers = new Headers({ Location: url.toString(), 'cache-control': 'no-store' });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * `GET /api/auth/google/callback` — finish Google OAuth, set session cookie.
 * Success lands on home; failures return to `/login`.
 */
export async function GET(request: Request): Promise<Response> {
  const config = resolveGoogleAuthConfig();
  if (!config) {
    return Response.json(
      { success: false, error: 'Google sign-in is not configured' },
      { status: 503 },
    );
  }

  const clearState = clearOAuthStateCookieHeader();
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) {
    return redirectTo(config.publicOrigin, '/login', { auth: 'error', reason: error }, [
      clearState,
    ]);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stored = decodeStateCookie(readCookie(request, GOOGLE_OAUTH_STATE_COOKIE));
  if (!code || !state || !stored || state !== stored.state) {
    return redirectTo(config.publicOrigin, '/login', { auth: 'error', reason: 'invalid_state' }, [
      clearState,
    ]);
  }

  try {
    const profile = await exchangeCodeForProfile(config, code, stored.codeVerifier);
    const sessionCookie = sessionCookieForProfile(config, profile);
    return redirectTo(config.publicOrigin, '/', { auth: 'success' }, [clearState, sessionCookie]);
  } catch (err) {
    const reason =
      err instanceof GoogleOAuthError
        ? err.code
        : err instanceof Error
          ? 'oauth_failed'
          : 'oauth_failed';
    return redirectTo(config.publicOrigin, '/login', { auth: 'error', reason }, [clearState]);
  }
}
