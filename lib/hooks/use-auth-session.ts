'use client';

import { useCallback, useEffect, useState } from 'react';

export type AuthSession =
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

type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'ready'; session: AuthSession }
  | { status: 'error'; session: null };

/**
 * Client Google auth session for the landing greeting.
 * Sign-in navigates to `/api/auth/google/start`; sign-out POSTs logout.
 */
export function useAuthSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (!res.ok) {
        setState({ status: 'error', session: null });
        return null;
      }
      const body = (await res.json()) as AuthSession;
      setState({ status: 'ready', session: body });
      return body;
    } catch {
      setState({ status: 'error', session: null });
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(() => {
    window.location.assign('/api/auth/google/start');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } finally {
      await refresh();
    }
  }, [refresh]);

  /**
   * After OAuth redirect (`?auth=success`), claim anonymous work into the
   * Google owner. Ignores 409 NO_PENDING_CLAIM (nothing to move).
   */
  const claimAnonymousWork = useCallback(async () => {
    try {
      const res = await fetch('/api/identity/claim', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.status === 409) return { ok: true as const, status: 'none' as const };
      if (!res.ok) return { ok: false as const };
      const body = (await res.json()) as { status?: string };
      return { ok: true as const, status: body.status ?? 'claimed' };
    } catch {
      return { ok: false as const };
    }
  }, []);

  return {
    status: state.status,
    session: state.session,
    refresh,
    signIn,
    signOut,
    claimAnonymousWork,
  };
}
