/**
 * Host Google session cookie + {@link OwnerAuthMethod}.
 *
 * Cookie format: `base64url(json).hex(hmac-sha256)`, signed with AUTH_SESSION_SECRET.
 * Owner id: `google:<sub>` (stable Google subject).
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { cookiesAreSecure } from '@/lib/server/cookie-secure';
import {
  OWNER_ROLES,
  type OwnerAuthMethod,
  type OwnerAuthMethodResult,
  type OwnerAuthRequest,
  type StoredOwnerDescription,
} from '@/lib/server/identity';

import { resolveGoogleAuthConfig } from './google-auth-config';

export const GOOGLE_SESSION_COOKIE = 'gs_google_session';
export const GOOGLE_OWNER_PREFIX = 'google:';

/** 30 days — long enough for a classroom session without re-prompting often. */
export const GOOGLE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const GOOGLE_ROLES: ReadonlySet<string> = new Set<string>([OWNER_ROLES.coursePublish]);

export interface GoogleSessionPayload {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly givenName: string;
  readonly picture: string;
  /** Unix seconds. */
  readonly exp: number;
}

function readCookie(headers: Headers, name: string): string | undefined {
  const encoded = headers.get('cookie');
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

function sessionSecure(): boolean {
  return cookiesAreSecure();
}

function signPayload(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('hex');
}

function encodePayload(payload: GoogleSessionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(encoded: string): GoogleSessionPayload | undefined {
  try {
    const raw: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!raw || typeof raw !== 'object') return undefined;
    const obj = raw as Record<string, unknown>;
    if (
      typeof obj.sub !== 'string' ||
      typeof obj.email !== 'string' ||
      typeof obj.name !== 'string' ||
      typeof obj.givenName !== 'string' ||
      typeof obj.picture !== 'string' ||
      typeof obj.exp !== 'number'
    ) {
      return undefined;
    }
    if (!obj.sub || !/^[\x21-\x7e]{1,200}$/.test(obj.sub)) return undefined;
    return {
      sub: obj.sub,
      email: obj.email,
      name: obj.name,
      givenName: obj.givenName,
      picture: obj.picture,
      exp: obj.exp,
    };
  } catch {
    return undefined;
  }
}

/** Mint a signed session token for the cookie value. */
export function createGoogleSessionToken(
  profile: Omit<GoogleSessionPayload, 'exp'>,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload: GoogleSessionPayload = {
    ...profile,
    exp: nowSeconds + GOOGLE_SESSION_MAX_AGE_SECONDS,
  };
  const encoded = encodePayload(payload);
  return `${encoded}.${signPayload(encoded, secret)}`;
}

/**
 * Verify a session token. Returns the payload, or `undefined` when absent /
 * malformed / bad signature / expired.
 */
export function verifyGoogleSessionToken(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleSessionPayload | undefined {
  if (!token) return undefined;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return undefined;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[0-9a-f]+$/i.test(signature)) return undefined;
  const expected = signPayload(encoded, secret);
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return undefined;
  const payload = decodePayload(encoded);
  if (!payload) return undefined;
  if (payload.exp <= nowSeconds) return undefined;
  return payload;
}

/** `Set-Cookie` that stores a Google session. */
export function googleSessionSetCookieHeader(token: string): string {
  const secure = sessionSecure() ? '; Secure' : '';
  return (
    `${GOOGLE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${GOOGLE_SESSION_MAX_AGE_SECONDS}${secure}`
  );
}

/** `Set-Cookie` that clears the Google session. */
export function clearGoogleSessionCookieHeader(): string {
  const secure = sessionSecure() ? '; Secure' : '';
  return `${GOOGLE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Read and verify the session from request headers. */
export function readGoogleSession(
  headers: Headers,
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleSessionPayload | undefined {
  const config = resolveGoogleAuthConfig();
  if (!config) return undefined;
  const token = readCookie(headers, GOOGLE_SESSION_COOKIE);
  return verifyGoogleSessionToken(token, config.sessionSecret, nowSeconds);
}

function ownerIdForSub(sub: string): string {
  return `${GOOGLE_OWNER_PREFIX}${sub}`;
}

function authenticateWithHeaders(headers: Headers): OwnerAuthMethodResult {
  const config = resolveGoogleAuthConfig();
  if (!config) return { status: 'not-applicable' };

  const token = readCookie(headers, GOOGLE_SESSION_COOKIE);
  if (token === undefined) return { status: 'not-applicable' };

  const payload = verifyGoogleSessionToken(token, config.sessionSecret);
  if (!payload) return { status: 'invalid', reason: 'google session invalid or expired' };

  const ownerId = ownerIdForSub(payload.sub);
  return {
    status: 'authenticated',
    principal: {
      ownerId,
      kind: 'user',
      roles: GOOGLE_ROLES,
      assurance: 'verified',
      channel: 'web',
    },
  };
}

/**
 * Owner auth method: present `gs_google_session` → Google user principal.
 * Register only when Google auth env is fully configured.
 */
export const googleSessionAuthMethod: OwnerAuthMethod = {
  name: 'googleSession',
  async authenticate(req: OwnerAuthRequest): Promise<OwnerAuthMethodResult> {
    return authenticateWithHeaders(req.headers);
  },
  describeStoredOwner(ownerId: string): StoredOwnerDescription | undefined {
    if (!ownerId.startsWith(GOOGLE_OWNER_PREFIX)) return undefined;
    return { kind: 'user', roles: GOOGLE_ROLES };
  },
};
