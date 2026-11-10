import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminEmailAllowlist, isAdminEmail } from '@/lib/server/identity/admin-emails';

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('adminEmailAllowlist', () => {
  it('is empty when unset', () => {
    expect(adminEmailAllowlist(undefined).size).toBe(0);
    expect(adminEmailAllowlist('').size).toBe(0);
  });

  it('parses comma-separated emails case-insensitively', () => {
    expect([...adminEmailAllowlist('Ada@Example.com, other@x.com ')]).toEqual([
      'ada@example.com',
      'other@x.com',
    ]);
  });
});

describe('isAdminEmail', () => {
  it('matches allowlisted emails ignoring case', () => {
    vi.stubEnv('ADMIN_EMAILS', 'lead@raid.sg');
    expect(isAdminEmail('Lead@Raid.sg')).toBe(true);
    expect(isAdminEmail('student@raid.sg')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});
