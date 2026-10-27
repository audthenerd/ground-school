import { clearGoogleSessionCookieHeader } from '@/lib/server/identity/host/google-session';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/logout` — clear the Google session cookie.
 * Same-origin JSON only (cookie-bearing).
 */
export async function POST(request: Request): Promise<Response> {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') {
    return Response.json(
      { success: false, error: 'cross-origin refused' },
      { status: 403 },
    );
  }
  const headers = new Headers({ 'cache-control': 'no-store' });
  headers.append('Set-Cookie', clearGoogleSessionCookieHeader());
  return Response.json({ success: true }, { status: 200, headers });
}
