/**
 * Edge-safe Google session payload parse + constants.
 *
 * Node (`google-session.ts`) and Edge (`google-session-edge.ts`) verifiers both
 * import this module, so it must stay free of `node:crypto` / `node:buffer`.
 */

/** Cookie name for the signed Google session. */
export const GOOGLE_SESSION_COOKIE = 'gs_google_session';

/** 30 days — long enough for a classroom session without re-prompting often. */
export const GOOGLE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Canonical HMAC-SHA256 signature: exactly 64 lowercase hex characters. */
const GOOGLE_SESSION_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

export interface GoogleSessionPayload {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly givenName: string;
  readonly picture: string;
  /** Unix seconds. */
  readonly exp: number;
}

/** Whether `signature` is a canonical 64-character lowercase hex signature. */
export function isGoogleSessionSignatureFormatValid(signature: string): boolean {
  return GOOGLE_SESSION_SIGNATURE_PATTERN.test(signature);
}

function base64UrlToBytes(encoded: string): Uint8Array | undefined {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad =
      normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const binary = atob(normalized + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

/**
 * Parse and validate the JSON payload half of a Google session token.
 * Does not check expiry — callers compare `exp` to now.
 */
export function parseGoogleSessionPayload(
  encoded: string,
): GoogleSessionPayload | undefined {
  const bytes = base64UrlToBytes(encoded);
  if (!bytes) return undefined;
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
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
    if (!Number.isFinite(obj.exp)) return undefined;
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

/** Split `encoded.signature`; returns undefined when the shape is wrong. */
export function splitGoogleSessionToken(
  token: string,
): { encoded: string; signature: string } | undefined {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return undefined;
  return {
    encoded: token.slice(0, dot),
    signature: token.slice(dot + 1),
  };
}
