import {
  assertGoogleAuthConfiguration,
  resolveGoogleAuthConfig,
} from '@/lib/server/identity/host/google-auth-config';
import {
  buildGoogleAuthorizationUrl,
  mintOAuthState,
  oauthStateSetCookieHeader,
} from '@/lib/server/identity/host/google-oauth';

export const runtime = 'nodejs';

/**
 * `GET /api/auth/google/start` — begin Google OAuth (PKCE). Redirects to Google.
 */
export async function GET(): Promise<Response> {
  try {
    assertGoogleAuthConfiguration();
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Google auth misconfigured',
      },
      { status: 503 },
    );
  }

  const config = resolveGoogleAuthConfig();
  if (!config) {
    return Response.json(
      {
        success: false,
        error:
          'Google sign-in is not configured. Set GOOGLE_OAUTH_CLIENT_ID, ' +
          'GOOGLE_OAUTH_CLIENT_SECRET, AUTH_SESSION_SECRET, and AUTH_PUBLIC_ORIGIN.',
      },
      { status: 503 },
    );
  }

  const oauth = mintOAuthState();
  const location = buildGoogleAuthorizationUrl(config, oauth);
  const headers = new Headers({ Location: location, 'cache-control': 'no-store' });
  headers.append('Set-Cookie', oauthStateSetCookieHeader(oauth));
  return new Response(null, { status: 302, headers });
}
