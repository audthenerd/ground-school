/**
 * Google OAuth + session env for the host Google owner-auth method.
 *
 * Fully configured → Google sign-in is available.
 * Partially configured → boot must fail (see {@link assertGoogleAuthConfiguration}).
 * Unset entirely → anonymous owners only; Google routes answer 503.
 */

export const GOOGLE_OAUTH_CLIENT_ID_ENV = 'GOOGLE_OAUTH_CLIENT_ID';
export const GOOGLE_OAUTH_CLIENT_SECRET_ENV = 'GOOGLE_OAUTH_CLIENT_SECRET';
export const AUTH_SESSION_SECRET_ENV = 'AUTH_SESSION_SECRET';
export const AUTH_PUBLIC_ORIGIN_ENV = 'AUTH_PUBLIC_ORIGIN';

export interface GoogleAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly sessionSecret: string;
  /** Origin with no trailing slash, e.g. `http://localhost:3000`. */
  readonly publicOrigin: string;
}

function readTrimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** True when every required Google auth env var is set. */
export function isGoogleAuthConfigured(): boolean {
  return (
    !!readTrimmed(GOOGLE_OAUTH_CLIENT_ID_ENV) &&
    !!readTrimmed(GOOGLE_OAUTH_CLIENT_SECRET_ENV) &&
    !!readTrimmed(AUTH_SESSION_SECRET_ENV) &&
    !!readTrimmed(AUTH_PUBLIC_ORIGIN_ENV)
  );
}

/**
 * Fail boot when Google auth is half-configured or fully set but invalid.
 * Call from instrumentation before owner-identity validation.
 */
export function assertGoogleAuthConfiguration(): void {
  const names = [
    GOOGLE_OAUTH_CLIENT_ID_ENV,
    GOOGLE_OAUTH_CLIENT_SECRET_ENV,
    AUTH_SESSION_SECRET_ENV,
    AUTH_PUBLIC_ORIGIN_ENV,
  ];
  const present = names.filter((name) => !!readTrimmed(name));
  if (present.length === 0) return;
  if (present.length !== 4) {
    const missing = names.filter((name) => !readTrimmed(name));
    throw new Error(
      `Google auth is partially configured (${present.join(', ')} set). ` +
        `Also set ${missing.join(', ')}, or unset the ones that are set. ` +
        `See .env.example (Google OAuth).`,
    );
  }
  // Validate origin shape and secret length (throws on bad values).
  resolveGoogleAuthConfig();
}

/** Resolved config, or `undefined` when Google auth is off. */
export function resolveGoogleAuthConfig(): GoogleAuthConfig | undefined {
  if (!isGoogleAuthConfigured()) return undefined;
  const publicOrigin = readTrimmed(AUTH_PUBLIC_ORIGIN_ENV)!.replace(/\/+$/, '');
  try {
    const url = new URL(publicOrigin);
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error('must be an origin only (no path, query, or hash)');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${AUTH_PUBLIC_ORIGIN_ENV} must be a valid origin such as ` +
        `http://localhost:3000 or https://example.com (${reason}).`,
    );
  }
  const sessionSecret = readTrimmed(AUTH_SESSION_SECRET_ENV)!;
  if (sessionSecret.length < 32) {
    throw new Error(
      `${AUTH_SESSION_SECRET_ENV} must be at least 32 characters ` +
        `(generate with: openssl rand -hex 32).`,
    );
  }
  return {
    clientId: readTrimmed(GOOGLE_OAUTH_CLIENT_ID_ENV)!,
    clientSecret: readTrimmed(GOOGLE_OAUTH_CLIENT_SECRET_ENV)!,
    sessionSecret,
    publicOrigin,
  };
}

/** Redirect URI registered with Google for this deployment. */
export function googleOAuthRedirectUri(config: GoogleAuthConfig): string {
  return `${config.publicOrigin}/api/auth/google/callback`;
}
