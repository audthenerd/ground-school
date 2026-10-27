import { isGoogleAuthConfigured } from '@/lib/server/identity/host/google-auth-config';
import { readGoogleSession } from '@/lib/server/identity/host/google-session';

export const runtime = 'nodejs';

export type AuthSessionResponse =
  | {
      authenticated: true;
      configured: true;
      sub: string;
      email: string;
      name: string;
      givenName: string;
      picture: string;
    }
  | {
      authenticated: false;
      configured: boolean;
    };

/**
 * `GET /api/auth/session` — current Google session for the greeting UI.
 */
export async function GET(request: Request): Promise<Response> {
  const configured = isGoogleAuthConfigured();
  const session = readGoogleSession(request.headers);
  const body: AuthSessionResponse = session
    ? {
        authenticated: true,
        configured: true,
        sub: session.sub,
        email: session.email,
        name: session.name,
        givenName: session.givenName,
        picture: session.picture,
      }
    : { authenticated: false, configured };

  return Response.json(body, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}
