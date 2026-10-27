import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GoogleAuthConfig } from '@/lib/server/identity/host/google-auth-config';
import {
  buildGoogleAuthorizationUrl,
  decodeStateCookie,
  exchangeCodeForProfile,
  GoogleOAuthError,
  mintOAuthState,
  oauthStateSetCookieHeader,
} from '@/lib/server/identity/host/google-oauth';

const CONFIG: GoogleAuthConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  sessionSecret: 'a'.repeat(32),
  publicOrigin: 'http://localhost:3000',
};

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google OAuth PKCE', () => {
  it('sends an S256 challenge of the verifier and the deployment redirect URI', () => {
    const oauth = { state: 'state-token', codeVerifier: 'verifier-token' };
    const url = new URL(buildGoogleAuthorizationUrl(CONFIG, oauth));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/google/callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(oauth.state);
    expect(url.searchParams.get('code_challenge')).toBe(
      base64Url(createHash('sha256').update(oauth.codeVerifier).digest()),
    );
  });

  it('round-trips the state cookie the callback verifies', () => {
    const oauth = mintOAuthState();
    const header = oauthStateSetCookieHeader(oauth);
    const encoded = header.split(';', 1)[0]?.split('=').slice(1).join('=');
    expect(decodeStateCookie(decodeURIComponent(encoded ?? ''))).toEqual(oauth);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=600');
  });
});

describe('exchangeCodeForProfile', () => {
  it('returns a session profile from the token and userinfo endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://oauth2.googleapis.com/token') {
          const body = String(init?.body);
          expect(body).toContain('code=auth-code');
          expect(body).toContain('code_verifier=verifier');
          expect(body).toContain('client_secret=client-secret');
          return Response.json({ access_token: 'ya29' });
        }
        if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
          expect(init?.headers).toEqual({ authorization: 'Bearer ya29' });
          return Response.json({
            sub: 'google-user-123',
            email: 'ada@example.com',
            name: 'Ada Lovelace',
            picture: 'https://example.com/ada.jpg',
          });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );

    await expect(exchangeCodeForProfile(CONFIG, 'auth-code', 'verifier')).resolves.toEqual({
      sub: 'google-user-123',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      givenName: 'Ada',
      picture: 'https://example.com/ada.jpg',
    });
  });

  it('rejects a token error without calling userinfo', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCodeForProfile(CONFIG, 'auth-code', 'verifier')).rejects.toBeInstanceOf(
      GoogleOAuthError,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a Google subject the session cookie cannot store', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://oauth2.googleapis.com/token') {
          return Response.json({ access_token: 'ya29' });
        }
        return Response.json({ sub: 'has space' });
      }),
    );

    await expect(exchangeCodeForProfile(CONFIG, 'auth-code', 'verifier')).rejects.toMatchObject({
      code: 'profile_unusable',
    });
  });
});
