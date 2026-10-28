'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plane } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthSession } from '@/lib/hooks/use-auth-session';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useBrand } from '@/lib/brand/brand-context';
import { cn } from '@/lib/utils';

/**
 * Required Google sign-in surface when OAuth is configured.
 * Middleware keeps unsigned users here; signed-in users are sent home.
 *
 * Auth error query params are read in an effect (not `useSearchParams`) so the
 * first client render matches SSR and avoids a Suspense/hydration mismatch.
 */
/** Official multicolor Google "G" mark for the sign-in CTA. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  const brand = useBrand();
  const { status, session, signIn } = useAuthSession();
  const [errorHandled, setErrorHandled] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (errorHandled) return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth !== 'error') return;
    const reason = params.get('reason') || 'unknown';
    toast.error(t('auth.signInFailed', { reason }));
    setErrorHandled(true);
    params.delete('auth');
    params.delete('reason');
    const next = params.toString();
    const clean = next ? `/login?${next}` : '/login';
    window.history.replaceState({}, '', clean);
  }, [errorHandled, t]);

  const configured = session?.configured === true;
  const showNotConfigured = status === 'ready' && !configured;

  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#f4f7fb] px-6 dark:bg-slate-950">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="ground-grid absolute inset-0" />
        <div className="ground-radar absolute left-1/2 top-[42%] size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <div className="ground-runway absolute left-1/2 top-[8%] h-[28rem] w-[9rem] -translate-x-1/2" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="ground-kicker mb-5 inline-flex items-center gap-2 px-1 py-1 text-[10px] font-bold uppercase tracking-[0.28em]">
          <Plane className="size-3.5" /> RSAF ops immersion training
        </div>

        <div className="mb-3 flex flex-col items-center">
          <div className="flex items-center gap-2.5 md:gap-3">
            <img
              src="/brand/ground-school-mark-minimal.svg"
              alt={brand.productName}
              className="size-[56px] object-contain md:size-[64px]"
            />
            <span className="text-[2rem] font-black leading-[0.92] tracking-[-0.055em] text-[#252525] md:text-[2.5rem] dark:text-slate-100">
              {brand.productName}
            </span>
          </div>
          <span className="mt-2 text-center font-mono text-[8px] font-bold uppercase tracking-[0.38em] text-[#3288c6] md:text-[9px]">
            Brief · Learn · Fly
          </span>
        </div>

        <div className="ground-brand-stripes mb-6 flex gap-1" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <h1 className="mb-2 text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          {t('auth.loginTitle')}
        </h1>
        <p className="mb-8 max-w-sm text-sm font-medium tracking-wide text-slate-500 dark:text-slate-400">
          {t('auth.loginSubtitle')}
        </p>

        {status === 'loading' ? (
          <div
            className="h-11 w-full max-w-xs animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800"
            aria-hidden="true"
          />
        ) : showNotConfigured ? (
          <p className="max-w-sm text-sm text-amber-700 dark:text-amber-400">
            {t('auth.notConfigured')}
          </p>
        ) : (
          <button
            type="button"
            disabled={signingIn}
            aria-busy={signingIn}
            onClick={() => {
              if (signingIn) return;
              setSigningIn(true);
              signIn();
            }}
            className={cn(
              'inline-flex h-11 w-full max-w-xs cursor-pointer items-center justify-center gap-3 rounded-full px-5',
              'border border-[#dadce0] bg-white text-sm font-medium text-[#3c4043]',
              'shadow-[0_1px_2px_rgba(60,64,67,0.08)] transition-all',
              'hover:bg-[#f8f9fa] hover:shadow-[0_1px_3px_rgba(60,64,67,0.16)]',
              'active:bg-[#f1f3f4] dark:border-[#8ab4f8]/40 dark:bg-white dark:text-[#3c4043]',
              'disabled:cursor-wait disabled:opacity-80',
            )}
          >
            {signingIn ? (
              <Loader2 className="size-5 shrink-0 animate-spin text-[#4285F4]" aria-hidden="true" />
            ) : (
              <GoogleMark className="size-5 shrink-0" />
            )}
            {t('auth.signInWithGoogle')}
          </button>
        )}
      </div>
    </div>
  );
}
