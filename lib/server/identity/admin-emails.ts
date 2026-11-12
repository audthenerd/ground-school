/**
 * Env-only admin allowlist (`ADMIN_EMAILS`).
 *
 * Comma-separated emails, compared case-insensitively. Empty / unset → nobody
 * is an admin. Used when granting `OWNER_ROLES.admin` on Google session auth
 * and when exposing `isAdmin` on `/api/auth/session`.
 */

const ADMIN_EMAILS_ENV = 'ADMIN_EMAILS';

/** Parsed, lowercased, de-duplicated admin emails from the environment. */
export function adminEmailAllowlist(
  raw: string | undefined = process.env[ADMIN_EMAILS_ENV],
): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  const emails = new Set<string>();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

/** Whether `email` is on the deployment's admin allowlist. */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email?.trim()) return false;
  return adminEmailAllowlist().has(email.trim().toLowerCase());
}
