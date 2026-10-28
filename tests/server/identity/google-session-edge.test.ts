import { describe, expect, it } from 'vitest';

import { createGoogleSessionToken } from '@/lib/server/identity/host/google-session';
import { verifyGoogleSessionTokenEdge } from '@/lib/server/identity/host/google-session-edge';

const SECRET = 'c'.repeat(32);
const PROFILE = {
  sub: 'google-user-edge',
  email: 'edge@example.com',
  name: 'Edge User',
  givenName: 'Edge',
  picture: 'https://example.com/edge.jpg',
};

describe('verifyGoogleSessionTokenEdge', () => {
  it('accepts a token minted by the Node signer', async () => {
    const now = 1_700_000_000;
    const token = createGoogleSessionToken(PROFILE, SECRET, now);
    const payload = await verifyGoogleSessionTokenEdge(token, SECRET, now + 10);
    expect(payload).toMatchObject(PROFILE);
    expect(payload?.exp).toBe(now + 30 * 24 * 60 * 60);
  });

  it('rejects a tampered payload', async () => {
    const token = createGoogleSessionToken(PROFILE, SECRET);
    const [encoded, signature] = token.split('.');
    const tampered = `${encoded!.slice(0, -1)}x.${signature}`;
    expect(await verifyGoogleSessionTokenEdge(tampered, SECRET)).toBeUndefined();
  });

  it('rejects an expired token', async () => {
    const now = 1_700_000_000;
    const token = createGoogleSessionToken(PROFILE, SECRET, now);
    expect(
      await verifyGoogleSessionTokenEdge(token, SECRET, now + 31 * 24 * 60 * 60),
    ).toBeUndefined();
  });

  it('rejects a missing or malformed token', async () => {
    expect(await verifyGoogleSessionTokenEdge(undefined, SECRET)).toBeUndefined();
    expect(await verifyGoogleSessionTokenEdge('not-a-token', SECRET)).toBeUndefined();
    expect(await verifyGoogleSessionTokenEdge('onlypayload.', SECRET)).toBeUndefined();
  });
});
