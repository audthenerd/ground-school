'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, RefreshCw, Shield, Trash2 } from 'lucide-react';

import { useAuthSession } from '@/lib/hooks/use-auth-session';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

interface CandidateView {
  id: string;
  stageId: string | null;
  runId: string;
  label: string | null;
  status: 'generating' | 'ready' | 'failed' | 'superseded';
  runState: string | null;
  scenesCompleted: number | null;
  scenesTotal: number | null;
  outlineTitle: string | null;
  createdAt: string;
}

interface ModelOption {
  id: string;
  providerId: string;
  modelId: string;
  label: string;
}

interface Overview {
  release: {
    stageId: string;
    candidateId: string;
    approvedBy: string;
    approvedAt: string;
  } | null;
  candidates: CandidateView[];
  models?: ModelOption[];
  currentModel?: string | null;
}

interface PromptRow {
  id: string;
  ownerId: string;
  sceneId: string | null;
  promptText: string;
  createdAt: string;
}

export default function AdminCurriculumPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { status: authStatus, session } = useAuthSession();
  const isAdmin = session?.authenticated === true && session.isAdmin === true;

  const [overview, setOverview] = useState<Overview | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overviewRes, promptsRes] = await Promise.all([
        fetch('/api/admin/curriculum/rsaf-commands', { credentials: 'same-origin' }),
        fetch('/api/admin/curriculum/rsaf-commands/prompts?limit=50', {
          credentials: 'same-origin',
        }),
      ]);
      if (overviewRes.status === 403 || promptsRes.status === 403) {
        router.replace('/');
        return;
      }
      if (!overviewRes.ok) throw new Error('Failed to load curriculum');
      const overviewBody = (await overviewRes.json()) as Overview;
      setOverview(overviewBody);
      setSelectedModel((prev) => {
        if (prev) return prev;
        const current = overviewBody.currentModel ?? '';
        const models = overviewBody.models ?? [];
        if (current && models.some((m) => m.id === current)) return current;
        return models[0]?.id ?? '';
      });
      if (promptsRes.ok) {
        const promptsBody = (await promptsRes.json()) as { prompts?: PromptRow[] };
        setPrompts(promptsBody.prompts ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!isAdmin) {
      router.replace('/');
      return;
    }
    void load();
  }, [authStatus, isAdmin, load, router]);

  // Poll while any candidate is still generating.
  useEffect(() => {
    if (!overview?.candidates.some((c) => c.status === 'generating')) return;
    const timer = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [overview, load]);

  const generateCandidates = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/curriculum/rsaf-commands/candidates', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          count: 3,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      });
      if (res.status === 403) {
        router.replace('/');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Failed to start generation');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  const approve = async (candidateId: string) => {
    if (!window.confirm('Approve this classroom as the shared version for all students?')) return;
    setApprovingId(candidateId);
    setError(null);
    try {
      const res = await fetch('/api/admin/curriculum/rsaf-commands/approve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });
      if (res.status === 403) {
        router.replace('/');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Failed to approve');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  };

  const removeCandidate = async (candidateId: string, isLive: boolean) => {
    const message = isLive
      ? t('admin.deleteLiveConfirm')
      : t('admin.deleteConfirm');
    if (!window.confirm(message)) return;
    setDeletingId(candidateId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/curriculum/rsaf-commands/candidates/${encodeURIComponent(candidateId)}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (res.status === 403) {
        router.replace('/');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Failed to delete');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  if (authStatus === 'loading' || (authStatus === 'ready' && !isAdmin && loading)) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-slate-500">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const statusLabel = (status: CandidateView['status']) => {
    switch (status) {
      case 'ready':
        return t('admin.statusReady');
      case 'generating':
        return t('admin.statusGenerating');
      case 'failed':
        return t('admin.statusFailed');
      case 'superseded':
        return t('admin.statusSuperseded');
    }
  };

  return (
    <div
      data-testid="admin-curriculum-page"
      className="ground-home min-h-[100dvh] w-full px-4 py-8 md:px-8 max-w-4xl mx-auto"
    >
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
          >
            <ArrowLeft className="size-4" />
            {t('admin.backHome')}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-6 text-primary" />
            {t('admin.curriculumTitle')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('admin.curriculumSubtitle')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          {(overview?.models?.length ?? 0) > 0 ? (
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>LLM</span>
              <select
                data-testid="admin-curriculum-model"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={generating}
                className="h-9 min-w-[14rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-800 dark:text-slate-100"
              >
                {(overview?.models ?? []).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label="Refresh"
          >
            <RefreshCw className="size-4" />
          </button>
          <button
            type="button"
            data-testid="admin-generate-candidates"
            onClick={() => void generateCandidates()}
            disabled={generating}
            className={cn(
              'h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5',
              'bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50',
            )}
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : null}
            {generating ? t('admin.generating') : t('admin.generateCandidates')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section
        data-testid="admin-live-release"
        className="mb-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">
          {t('admin.approvedLive')}
        </h2>
        {overview?.release ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-mono text-xs text-slate-500">{overview.release.stageId}</div>
              <div className="text-slate-600 dark:text-slate-300">
                Approved {new Date(overview.release.approvedAt).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/classroom/${encodeURIComponent(overview.release.stageId)}`}
                className="text-sm text-primary hover:underline"
              >
                {t('admin.preview')}
              </Link>
              <button
                type="button"
                data-testid="admin-delete-live"
                onClick={() => void removeCandidate(overview.release!.candidateId, true)}
                disabled={deletingId === overview.release.candidateId}
                className="h-8 px-2.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {deletingId === overview.release.candidateId ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                {deletingId === overview.release.candidateId ? t('admin.deleting') : t('admin.delete')}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('admin.noRelease')}</p>
        )}
      </section>

      <section className="mb-8 space-y-3">
        {loading && !overview ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : null}
        {(overview?.candidates ?? []).map((candidate) => {
          const isLive = overview?.release?.candidateId === candidate.id;
          return (
            <div
              key={candidate.id}
              data-testid={`admin-candidate-${candidate.id}`}
              className={cn(
                'rounded-xl border p-4 bg-white/70 dark:bg-slate-900/50',
                isLive
                  ? 'border-primary/50 ring-1 ring-primary/20'
                  : 'border-slate-200 dark:border-slate-700',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {candidate.label ?? candidate.id.slice(0, 8)}
                    {isLive ? (
                      <span className="ml-2 text-xs text-primary font-semibold">LIVE</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 space-y-0.5">
                    <div>
                      {statusLabel(candidate.status)}
                      {candidate.runState ? ` · run ${candidate.runState}` : ''}
                      {candidate.scenesTotal
                        ? ` · ${candidate.scenesCompleted ?? 0}/${candidate.scenesTotal} scenes`
                        : ''}
                    </div>
                    {candidate.outlineTitle ? <div>{candidate.outlineTitle}</div> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {candidate.stageId ? (
                    <Link
                      href={`/classroom/${encodeURIComponent(candidate.stageId)}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {t('admin.preview')}
                    </Link>
                  ) : null}
                  {candidate.status === 'ready' && !isLive ? (
                    <button
                      type="button"
                      data-testid="admin-approve"
                      onClick={() => void approve(candidate.id)}
                      disabled={approvingId === candidate.id || deletingId === candidate.id}
                      className="h-8 px-2.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {approvingId === candidate.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      {approvingId === candidate.id ? t('admin.approving') : t('admin.approve')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="admin-delete-candidate"
                    onClick={() => void removeCandidate(candidate.id, isLive)}
                    disabled={deletingId === candidate.id || approvingId === candidate.id}
                    className="h-8 px-2.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {deletingId === candidate.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    {deletingId === candidate.id ? t('admin.deleting') : t('admin.delete')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {overview && overview.candidates.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            Generate candidates to begin review.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {t('admin.promptsTitle')}
        </h2>
        {prompts.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin.promptsEmpty')}</p>
        ) : (
          <ul className="space-y-3 max-h-[28rem] overflow-y-auto">
            {prompts.map((prompt) => (
              <li
                key={prompt.id}
                className="border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0"
              >
                <div className="text-[11px] text-slate-400 font-mono mb-1">
                  {new Date(prompt.createdAt).toLocaleString()} · {prompt.ownerId}
                  {prompt.sceneId ? ` · scene ${prompt.sceneId}` : ''}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">{prompt.promptText}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
