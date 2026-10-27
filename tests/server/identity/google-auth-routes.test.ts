import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as callback } from '@/app/api/auth/google/callback/route';
import { GET as start } from '@/app/api/auth/google/start/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as session } from '@/app/api/auth/session/route';
import {
  createGoogleSessionToken,
  GOOGLE_SESSION_COOKIE,
} from '@/lib/server/identity/host/google-session';
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  mintOAuthState,
  oauthStateSetCookieHeader,
} from '@/lib/server/identity/host/google-oauth';

const SECRET = 'b'.repeat(32);
const PROFILE = {
  sub: 'google-user-123',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  givenName: 'Ada',
  picture: 'https://example.com/ada.jpg',
};

beforeEach(() => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '');
  vi.stubEnv('AUTH_SESSION_SECRET', '');
  vi.stubEnv('AUTH_PUBLIC_ORIGIN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureGoogle(): void {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('AUTH_SESSION_SECRET', SECRET);
  vi.stubEnv('AUTH_PUBLIC_ORIGIN', 'http://localhost:3000');
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}

describe('GET /api/auth/google/start', () => {
  it('answers 503 when Google auth is unset', async () => {
    const response = await start();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it('redirects to Google and stores the PKCE state', async () => {
    configureGoogle();
    const response = await start();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(
      /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
    );
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`)).toBe(true);
    expect(setCookie).toContain('HttpOnly');
  });
});

describe('GET /api/auth/google/callback', () => {
  it('answers 503 when Google auth is unset', async () => {
    const response = await callback(new Request('http://localhost/api/auth/google/callback'));
    expect(response.status).toBe(503);
  });

  it('sends a provider error home and clears the state cookie', async () => {
    configureGoogle();
    const response = await callback(
      new Request('http://localhost/api/auth/google/callback?error=access_denied'),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/?auth=error&reason=access_denied',
    );
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('refuses a callback whose state does not match the cookie', async () => {
    configureGoogle();
    const stored = oauthStateSetCookieHeader(mintOAuthState());
    const response = await callback(
      new Request('http://localhost/api/auth/google/callback?code=abc&state=other', {
        headers: { cookie: cookiePair(stored) },
      }),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/?auth=error&reason=invalid_state',
    );
    expect(response.headers.get('set-cookie')).not.toContain(`${GOOGLE_SESSION_COOKIE}=`);
  });

  it('sets the session cookie after a successful exchange', async () => {
    configureGoogle();
    const oauth = mintOAuthState();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://oauth2.googleapis.com/token') {
          return Response.json({ access_token: 'ya29' });
        }
        return Response.json(PROFILE);
      }),
    );

    const response = await callback(
      new Request(
        `http://localhost/api/auth/google/callback?code=abc&state=${encodeURIComponent(oauth.state)}`,
        { headers: { cookie: cookiePair(oauthStateSetCookieHeader(oauth)) } },
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:3000/?auth=success');
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((value) => value.includes('Max-Age=0'))).toBe(true);
    expect(cookies.some((value) => value.startsWith(`${GOOGLE_SESSION_COOKIE}=`))).toBe(true);
  });
});

describe('GET /api/auth/session', () => {
  it('reports Google auth as off when it is unset', async () => {
    const response = await session(new Request('http://localhost/api/auth/session'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false, configured: false });
  });

  it('returns the signed-in profile', async () => {
    configureGoogle();
    const token = createGoogleSessionToken(PROFILE, SECRET);
    const response = await session(
      new Request('http://localhost/api/auth/session', {
        headers: { cookie: `${GOOGLE_SESSION_COOKIE}=${encodeURIComponent(token)}` },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      configured: true,
      ...PROFILE,
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('refuses a cross-site request', async () => {
    const response = await logout(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('clears the session cookie for a same-origin request', async () => {
    const response = await logout(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain(`${GOOGLE_SESSION_COOKIE}=;`);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
