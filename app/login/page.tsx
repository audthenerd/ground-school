'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plane } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthSession } from '@/lib/hooks/use-auth-session';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useBrand } from '@/lib/brand/brand-context';
import { cn } from '@/lib/utils';

/**
 * Required Google sign-in surface when OAuth is configured.
 * Middleware keeps unsigned users here; signed-in users are sent home.
 */
function LoginContent() {
  const { t } = useI18n();
  const brand = useBrand();
  const searchParams = useSearchParams();
  const { status, session, signIn } = useAuthSession();
  const [errorHandled, setErrorHandled] = useState(false);

  useEffect(() => {
    if (errorHandled) return;
    const auth = searchParams.get('auth');
    if (auth !== 'error') return;
    const reason = searchParams.get('reason') || 'unknown';
    toast.error(t('auth.signInFailed', { reason }));
    setErrorHandled(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('auth');
    params.delete('reason');
    const next = params.toString();
    const clean = next ? `/login?${next}` : '/login';
    window.history.replaceState({}, '', clean);
  }, [errorHandled, searchParams, t]);

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

        <div className="mb-3 flex items-center gap-2.5 md:gap-3">
          <img
            src="/brand/ground-school-mark-minimal.svg"
            alt={brand.productName}
            className="size-[56px] object-contain md:size-[64px]"
          />
          <div className="flex flex-col text-left">
            <span className="text-[2rem] font-black leading-[0.92] tracking-[-0.055em] text-[#252525] md:text-[2.5rem] dark:text-slate-100">
              {brand.productName}
            </span>
            <span className="mt-2 font-mono text-[8px] font-bold uppercase tracking-[0.38em] text-[#3288c6] md:text-[9px]">
              Brief · Learn · Fly
            </span>
          </div>
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
            onClick={signIn}
            className={cn(
              'ground-composer inline-flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl px-5',
              'text-sm font-semibold text-slate-800 transition-all',
              'hover:-translate-y-0.5 active:translate-y-0 dark:text-slate-100',
            )}
          >
            {t('auth.signInWithGoogle')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
