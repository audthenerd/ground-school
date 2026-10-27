/**
 * Google OAuth authorization-code + PKCE helpers for the host auth routes.
 * Identity is established via Google's token endpoint + OpenID userinfo
 * (HTTPS + client secret), then stored in our HMAC session cookie.
 */

import { createHash, randomBytes } from 'crypto';

import { cookiesAreSecure } from '@/lib/server/cookie-secure';

import {
  type GoogleAuthConfig,
  googleOAuthRedirectUri,
} from './google-auth-config';
import {
  createGoogleSessionToken,
  type GoogleSessionPayload,
  googleSessionSetCookieHeader,
} from './google-session';

export const GOOGLE_OAUTH_STATE_COOKIE = 'gs_google_oauth';
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface OAuthStatePayload {
  readonly state: string;
  readonly codeVerifier: string;
}

function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function mintOAuthState(): OAuthStatePayload {
  return {
    state: base64Url(randomBytes(24)),
    codeVerifier: base64Url(randomBytes(32)),
  };
}

function codeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

function encodeStateCookie(payload: OAuthStatePayload): string {
  return base64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
}

export function decodeStateCookie(value: string | undefined): OAuthStatePayload | undefined {
  if (!value) return undefined;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!raw || typeof raw !== 'object') return undefined;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.state !== 'string' || typeof obj.codeVerifier !== 'string') return undefined;
    if (!obj.state || !obj.codeVerifier) return undefined;
    return { state: obj.state, codeVerifier: obj.codeVerifier };
  } catch {
    return undefined;
  }
}

function secureFlag(): string {
  return cookiesAreSecure() ? '; Secure' : '';
}

export function oauthStateSetCookieHeader(payload: OAuthStatePayload): string {
  const value = encodeURIComponent(encodeStateCookie(payload));
  return (
    `${GOOGLE_OAUTH_STATE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}${secureFlag()}`
  );
}

export function clearOAuthStateCookieHeader(): string {
  return `${GOOGLE_OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

export function buildGoogleAuthorizationUrl(
  config: GoogleAuthConfig,
  oauth: OAuthStatePayload,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: googleOAuthRedirectUri(config),
    response_type: 'code',
    scope: 'openid email profile',
    state: oauth.state,
    code_challenge: codeChallenge(oauth.codeVerifier),
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'exchange_failed' | 'userinfo_failed' | 'profile_unusable',
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

export async function exchangeCodeForProfile(
  config: GoogleAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<Omit<GoogleSessionPayload, 'exp'>> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: googleOAuthRedirectUri(config),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new GoogleOAuthError(
      tokenJson.error_description || tokenJson.error || `token HTTP ${tokenRes.status}`,
      'exchange_failed',
    );
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const user = (await userRes.json()) as GoogleUserInfo;
  if (!userRes.ok || !user.sub) {
    throw new GoogleOAuthError(
      `userinfo HTTP ${userRes.status}`,
      'userinfo_failed',
    );
  }
  if (!/^[\x21-\x7e]{1,200}$/.test(user.sub)) {
    throw new GoogleOAuthError('unusable Google sub', 'profile_unusable');
  }

  return {
    sub: user.sub,
    email: typeof user.email === 'string' ? user.email : '',
    name: typeof user.name === 'string' ? user.name : '',
    givenName:
      typeof user.given_name === 'string' && user.given_name
        ? user.given_name
        : typeof user.name === 'string'
          ? user.name.split(/\s+/)[0] || ''
          : '',
    picture: typeof user.picture === 'string' ? user.picture : '',
  };
}

/** Build the session Set-Cookie after a successful OAuth exchange. */
export function sessionCookieForProfile(
  config: GoogleAuthConfig,
  profile: Omit<GoogleSessionPayload, 'exp'>,
): string {
  const token = createGoogleSessionToken(profile, config.sessionSecret);
  return googleSessionSetCookieHeader(token);
}
