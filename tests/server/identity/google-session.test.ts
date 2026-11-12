import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGoogleSessionToken,
  GOOGLE_OWNER_PREFIX,
  GOOGLE_SESSION_COOKIE,
  googleSessionAuthMethod,
  verifyGoogleSessionToken,
} from '@/lib/server/identity/host/google-session';

const SECRET = 'a'.repeat(32);
const PROFILE = {
  sub: 'google-user-123',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  givenName: 'Ada',
  picture: 'https://example.com/ada.jpg',
};

/** Cleared first so a developer's exported Google env cannot change these cases. */
const GOOGLE_AUTH_ENV = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'AUTH_SESSION_SECRET',
  'AUTH_PUBLIC_ORIGIN',
  'ADMIN_EMAILS',
] as const;

beforeEach(() => {
  for (const name of GOOGLE_AUTH_ENV) vi.stubEnv(name, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubGoogleEnv() {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('AUTH_SESSION_SECRET', SECRET);
  vi.stubEnv('AUTH_PUBLIC_ORIGIN', 'http://localhost:3000');
}

describe('Google session token', () => {
  it('round-trips a signed payload', () => {
    const now = 1_700_000_000;
    const token = createGoogleSessionToken(PROFILE, SECRET, now);
    const payload = verifyGoogleSessionToken(token, SECRET, now + 10);
    expect(payload).toMatchObject(PROFILE);
    expect(payload?.exp).toBe(now + 30 * 24 * 60 * 60);
  });

  it('rejects a tampered payload', () => {
    const token = createGoogleSessionToken(PROFILE, SECRET);
    const [encoded] = token.split('.');
    const tampered = `${encoded.slice(0, -1)}x.${token.split('.')[1]}`;
    expect(verifyGoogleSessionToken(tampered, SECRET)).toBeUndefined();
  });

  it('rejects an expired token', () => {
    const now = 1_700_000_000;
    const token = createGoogleSessionToken(PROFILE, SECRET, now);
    expect(verifyGoogleSessionToken(token, SECRET, now + 31 * 24 * 60 * 60)).toBeUndefined();
  });
});

describe('googleSessionAuthMethod', () => {
  it('is not-applicable when Google auth is unset', async () => {
    const result = await googleSessionAuthMethod.authenticate({
      headers: new Headers(),
    });
    expect(result).toEqual({ status: 'not-applicable' });
  });

  it('is not-applicable when the cookie is absent', async () => {
    stubGoogleEnv();
    const result = await googleSessionAuthMethod.authenticate({
      headers: new Headers(),
    });
    expect(result).toEqual({ status: 'not-applicable' });
  });

  it('is invalid when the cookie is present but bad', async () => {
    stubGoogleEnv();
    const result = await googleSessionAuthMethod.authenticate({
      headers: new Headers({ cookie: `${GOOGLE_SESSION_COOKIE}=not-a-token` }),
    });
    expect(result.status).toBe('invalid');
  });

  it('authenticates a valid session as google:<sub>', async () => {
    stubGoogleEnv();
    const token = createGoogleSessionToken(PROFILE, SECRET);
    const result = await googleSessionAuthMethod.authenticate({
      headers: new Headers({
        cookie: `${GOOGLE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
      }),
    });
    expect(result.status).toBe('authenticated');
    if (result.status !== 'authenticated') return;
    expect(result.principal.ownerId).toBe(`${GOOGLE_OWNER_PREFIX}${PROFILE.sub}`);
    expect(result.principal.kind).toBe('user');
    expect(result.principal.assurance).toBe('verified');
    expect(result.principal.roles.has('course:publish')).toBe(true);
    expect(result.principal.roles.has('admin')).toBe(false);
  });

  it('grants admin when the session email is on ADMIN_EMAILS', async () => {
    stubGoogleEnv();
    vi.stubEnv('ADMIN_EMAILS', 'Ada@Example.com, other@example.com');
    const token = createGoogleSessionToken(PROFILE, SECRET);
    const result = await googleSessionAuthMethod.authenticate({
      headers: new Headers({
        cookie: `${GOOGLE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
      }),
    });
    expect(result.status).toBe('authenticated');
    if (result.status !== 'authenticated') return;
    expect(result.principal.roles.has('admin')).toBe(true);
    expect(result.principal.roles.has('course:publish')).toBe(true);
  });

  it('describes stored google: owners', () => {
    expect(googleSessionAuthMethod.describeStoredOwner?.(`${GOOGLE_OWNER_PREFIX}abc`)).toEqual({
      kind: 'user',
      roles: expect.any(Set),
    });
    expect(googleSessionAuthMethod.describeStoredOwner?.('anon:x')).toBeUndefined();
  });
});

describe('assertGoogleAuthConfiguration', () => {
  it('allows all unset', async () => {
    const { assertGoogleAuthConfiguration } =
      await import('@/lib/server/identity/host/google-auth-config');
    expect(() => assertGoogleAuthConfiguration()).not.toThrow();
  });

  it('rejects partial configuration', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'only-id');
    const { assertGoogleAuthConfiguration } =
      await import('@/lib/server/identity/host/google-auth-config');
    expect(() => assertGoogleAuthConfiguration()).toThrow(/partially configured/);
  });

  it('rejects a short session secret', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('AUTH_SESSION_SECRET', 'too-short');
    vi.stubEnv('AUTH_PUBLIC_ORIGIN', 'http://localhost:3000');
    const { assertGoogleAuthConfiguration } =
      await import('@/lib/server/identity/host/google-auth-config');
    expect(() => assertGoogleAuthConfiguration()).toThrow(/AUTH_SESSION_SECRET/);
  });
});
