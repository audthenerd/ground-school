/**
 * Edge-compatible verifier for HMAC-signed Google session cookies.
 *
 * Mirrors {@link verifyGoogleSessionToken} in `google-session.ts` using only the
 * Web Crypto API so Edge middleware can import it.
 */

import {
  isGoogleSessionSignatureFormatValid,
  parseGoogleSessionPayload,
  splitGoogleSessionToken,
  type GoogleSessionPayload,
} from './google-session-shared';

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a session token. Returns the payload, or `undefined` when absent /
 * malformed / bad signature / expired.
 */
export async function verifyGoogleSessionTokenEdge(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<GoogleSessionPayload | undefined> {
  if (!token) return undefined;
  const parts = splitGoogleSessionToken(token);
  if (!parts) return undefined;
  if (!isGoogleSessionSignatureFormatValid(parts.signature)) return undefined;

  const key = await crypto.subtle.importKey(
    'raw',
    encode(secret).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = bufToHex(
    await crypto.subtle.sign('HMAC', key, encode(parts.encoded).buffer as ArrayBuffer),
  );

  if (parts.signature.length !== expected.length) return undefined;
  let mismatch = 0;
  for (let i = 0; i < parts.signature.length; i++) {
    mismatch |= parts.signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return undefined;

  const payload = parseGoogleSessionPayload(parts.encoded);
  if (!payload) return undefined;
  if (payload.exp <= nowSeconds) return undefined;
  return payload;
}
