'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  Layers3,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';

import { useAuthSession } from '@/lib/hooks/use-auth-session';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

type AssessmentLevel = 'L1' | 'L2' | 'L3';

interface CandidateView {
  id: string;
  stageId: string | null;
  runId: string;
  label: string | null;
  status: 'generating' | 'ready' | 'failed' | 'superseded';
  assessmentLevel?: AssessmentLevel;
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

interface ReleaseView {
  stageId: string;
  candidateId: string;
  approvedBy: string;
  approvedAt: string;
  assessmentLevel?: AssessmentLevel;
}

interface BankReadinessRow {
  level: AssessmentLevel;
  availableTotal: number;
  targetCount: number;
  ready: boolean;
}

interface Overview {
  release: ReleaseView | null;
  releases?: ReleaseView[];
  candidates: CandidateView[];
  models?: ModelOption[];
  currentModel?: string | null;
  bankReadiness?: BankReadinessRow[];
  levelHelpers?: Record<AssessmentLevel, string>;
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
  const [selectedLevel, setSelectedLevel] = useState<AssessmentLevel>('L1');

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
          level: selectedLevel,
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
    if (
      !window.confirm(
        `Approve this ${selectedLevel} classroom as the shared version for all students at this level?`,
      )
    )
      return;
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
    const message = isLive ? t('admin.deleteLiveConfirm') : t('admin.deleteConfirm');
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

  const selectedCandidates = (overview?.candidates ?? []).filter(
    (candidate) => (candidate.assessmentLevel ?? 'L1') === selectedLevel,
  );
  const liveRelease =
    overview?.releases?.find((release) => (release.assessmentLevel ?? 'L1') === selectedLevel) ??
    (selectedLevel === 'L1' ? overview?.release : null) ??
    null;
  const selectedReadiness = overview?.bankReadiness?.find((row) => row.level === selectedLevel);
  const readyCandidates = selectedCandidates.filter((candidate) => candidate.status === 'ready');

  return (
    <div
      data-testid="admin-curriculum-page"
      className="min-h-[100dvh] w-full bg-[#f4f7fb] text-[#172033]"
    >
      <header className="border-b border-[#dce3ec] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#dce3ec] text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-[#172033]"
              aria-label={t('admin.backHome')}
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">
                <ShieldCheck className="size-4" />
                Ground School admin
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
                {t('admin.curriculumTitle')}
              </h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2" aria-label="Admin navigation">
            <Link
              href="/admin/learners"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-[#172033]"
              data-testid="admin-learners-link"
            >
              <Users className="size-4" />
              {t('admin.learnersLink')}
            </Link>
            <Link
              href="/admin/question-bank"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-[#172033]"
              data-testid="admin-question-bank-link"
            >
              <BookOpen className="size-4" />
              {t('admin.questionBankLink')}
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[#dce3ec] text-slate-500 transition hover:bg-slate-50 hover:text-[#172033]"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 md:px-8 md:py-10">
        <div className="mb-7 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-[#2563eb]">Curriculum operations</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-[#172033]">
              Build, review and release classrooms.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {t('admin.curriculumSubtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="size-2 rounded-full bg-emerald-500" />
            Curriculum service online
          </div>
        </div>

        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <section className="mb-6 overflow-hidden rounded-2xl border border-[#d7e0eb] bg-white">
          <div className="h-1 bg-[#2563eb]" />
          <div className="grid gap-5 p-5 lg:p-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] xl:items-end">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#172033]">
                <Sparkles className="size-4 text-[#2563eb]" />
                Candidate generator
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {overview?.levelHelpers?.[selectedLevel] ??
                  'Generate three classroom variations, inspect the results, then approve one for learners.'}
              </p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-500">
                Assessment level
                <select
                  data-testid="admin-curriculum-level"
                  value={selectedLevel}
                  onChange={(event) => setSelectedLevel(event.target.value as AssessmentLevel)}
                  disabled={generating}
                  className="h-10 w-full min-w-0 rounded-lg border border-[#cfd8e5] bg-white px-3 text-sm font-medium text-[#172033] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="L1">L1 Immersed</option>
                  <option value="L2">L2 Capable</option>
                  <option value="L3">L3 Lead-Capable</option>
                </select>
              </label>
              {(overview?.models?.length ?? 0) > 0 ? (
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-500">
                  Generation model
                  <select
                    data-testid="admin-curriculum-model"
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                    disabled={generating}
                    className="h-10 w-full min-w-0 rounded-lg border border-[#cfd8e5] bg-white px-3 text-sm text-[#172033] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
                  >
                    {(overview?.models ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div />
              )}
              <button
                type="button"
                data-testid="admin-generate-candidates"
                onClick={() => void generateCandidates()}
                disabled={generating}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#172033] px-4 text-sm font-semibold text-white transition hover:bg-[#25324a] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 sm:justify-self-end"
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4 shrink-0" />
                )}
                {generating ? t('admin.generating') : t('admin.generateCandidates')}
              </button>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#dce3ec] bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              Live release <ShieldCheck className="size-4 text-[#2563eb]" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">
              {liveRelease ? selectedLevel : '—'}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {liveRelease ? 'Approved classroom active' : 'No classroom released'}
            </p>
          </div>
          <div className="rounded-xl border border-[#dce3ec] bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              Candidate set <Layers3 className="size-4 text-[#2563eb]" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">
              {selectedCandidates.length}
            </div>
            <p className="mt-1 text-xs text-slate-400">{readyCandidates.length} ready for review</p>
          </div>
          <div className="rounded-xl border border-[#dce3ec] bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              Question bank <BookOpen className="size-4 text-[#2563eb]" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">
              {selectedReadiness
                ? `${selectedReadiness.availableTotal}/${selectedReadiness.targetCount}`
                : '—'}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {selectedReadiness?.ready ? 'Coverage target met' : 'Coverage needs attention'}
            </p>
          </div>
          <div className="rounded-xl border border-[#dce3ec] bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              Learner prompts <MessageSquareText className="size-4 text-[#2563eb]" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{prompts.length}</div>
            <p className="mt-1 text-xs text-slate-400">Recent prompts available</p>
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <section
              data-testid="admin-live-release"
              className="rounded-2xl border border-[#dce3ec] bg-white p-5 md:p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <h3 className="text-base font-semibold">{t('admin.approvedLive')}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Current {selectedLevel} learner release
                  </p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">
                  {selectedLevel}
                </span>
              </div>

              {!liveRelease ? (
                <div className="rounded-xl border border-dashed border-[#cfd8e5] bg-slate-50 px-4 py-7 text-center">
                  <FileText className="mx-auto size-5 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-600">{t('admin.noRelease')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Approve a ready candidate to publish it here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-semibold text-[#2563eb]">
                      {liveRelease.stageId}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock3 className="size-3.5" />
                      Approved {new Date(liveRelease.approvedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/classroom/${encodeURIComponent(liveRelease.stageId)}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-[#2563eb] transition hover:bg-blue-50"
                    >
                      {t('admin.preview')}
                      <ExternalLink className="size-3.5" />
                    </Link>
                    <button
                      type="button"
                      data-testid="admin-delete-live"
                      onClick={() => void removeCandidate(liveRelease.candidateId, true)}
                      disabled={deletingId === liveRelease.candidateId}
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      aria-label={t('admin.delete')}
                    >
                      {deletingId === liveRelease.candidateId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#dce3ec] bg-white">
              <div className="flex items-center justify-between border-b border-[#e5eaf0] px-5 py-4 md:px-6">
                <div>
                  <h3 className="text-base font-semibold">Candidate review</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Compare generated classrooms before release.
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {selectedCandidates.length} total
                </span>
              </div>

              <div className="divide-y divide-[#e8edf3]">
                {loading && !overview ? (
                  <div className="flex justify-center py-14 text-slate-400">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                ) : null}

                {selectedCandidates.map((candidate, index) => {
                  const isLive = liveRelease?.candidateId === candidate.id;
                  const progress = candidate.scenesTotal
                    ? Math.min(
                        100,
                        Math.round(
                          ((candidate.scenesCompleted ?? 0) / candidate.scenesTotal) * 100,
                        ),
                      )
                    : null;
                  return (
                    <article
                      key={candidate.id}
                      data-testid={`admin-candidate-${candidate.id}`}
                      className={cn('p-5 md:p-6', isLive && 'bg-blue-50/40')}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-400">
                              CANDIDATE {String(index + 1).padStart(2, '0')}
                            </span>
                            <span
                              className={cn(
                                'rounded-md px-2 py-1 text-[11px] font-semibold',
                                candidate.status === 'ready' && 'bg-emerald-50 text-emerald-700',
                                candidate.status === 'generating' && 'bg-amber-50 text-amber-700',
                                candidate.status === 'failed' && 'bg-red-50 text-red-700',
                                candidate.status === 'superseded' && 'bg-slate-100 text-slate-500',
                              )}
                            >
                              {statusLabel(candidate.status)}
                            </span>
                            {isLive ? (
                              <span className="rounded-md bg-[#2563eb] px-2 py-1 text-[11px] font-semibold text-white">
                                LIVE
                              </span>
                            ) : null}
                          </div>
                          <h4 className="mt-2 truncate text-base font-semibold text-[#172033]">
                            {candidate.label ?? candidate.id.slice(0, 8)}
                          </h4>
                          {candidate.outlineTitle ? (
                            <p className="mt-1 text-sm text-slate-500">{candidate.outlineTitle}</p>
                          ) : null}
                          {progress !== null ? (
                            <div className="mt-4 max-w-sm">
                              <div className="mb-1.5 flex justify-between text-[11px] font-medium text-slate-400">
                                <span>
                                  {candidate.runState
                                    ? `Run ${candidate.runState}`
                                    : 'Scene generation'}
                                </span>
                                <span>
                                  {candidate.scenesCompleted ?? 0}/{candidate.scenesTotal}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-[#2563eb]"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {candidate.stageId ? (
                            <Link
                              href={`/classroom/${encodeURIComponent(candidate.stageId)}`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cfd8e5] px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              {t('admin.preview')}
                              <ExternalLink className="size-3.5" />
                            </Link>
                          ) : null}
                          {candidate.status === 'ready' && !isLive ? (
                            <button
                              type="button"
                              data-testid="admin-approve"
                              onClick={() => void approve(candidate.id)}
                              disabled={approvingId === candidate.id || deletingId === candidate.id}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#172033] px-3 text-xs font-semibold text-white transition hover:bg-[#25324a] disabled:opacity-50"
                            >
                              {approvingId === candidate.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5" />
                              )}
                              {approvingId === candidate.id
                                ? t('admin.approving')
                                : t('admin.approve')}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            data-testid="admin-delete-candidate"
                            onClick={() => void removeCandidate(candidate.id, isLive)}
                            disabled={deletingId === candidate.id || approvingId === candidate.id}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            aria-label={t('admin.delete')}
                          >
                            {deletingId === candidate.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {overview && selectedCandidates.length === 0 ? (
                  <div className="px-5 py-14 text-center">
                    <Layers3 className="mx-auto size-6 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-600">
                      No {selectedLevel} candidates yet
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Generate a candidate set to begin review.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section
              data-testid="admin-bank-readiness"
              className="rounded-2xl border border-[#dce3ec] bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Question coverage</h3>
                  <p className="mt-1 text-xs text-slate-400">Readiness by assessment level</p>
                </div>
                <BookOpen className="size-4 text-[#2563eb]" />
              </div>
              <div className="mt-5 space-y-4">
                {(overview?.bankReadiness ?? []).map((row) => {
                  const coverage = row.targetCount
                    ? Math.min(100, Math.round((row.availableTotal / row.targetCount) * 100))
                    : 0;
                  return (
                    <div key={row.level}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span
                          className={cn(
                            'font-semibold',
                            row.level === selectedLevel ? 'text-[#2563eb]' : 'text-slate-600',
                          )}
                        >
                          {row.level}
                        </span>
                        <span className="font-mono text-slate-400">
                          {row.availableTotal}/{row.targetCount}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            row.ready ? 'bg-[#2563eb]' : 'bg-amber-400',
                          )}
                          style={{ width: `${coverage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link
                href="/admin/question-bank"
                className="mt-5 flex items-center justify-between border-t border-[#e8edf3] pt-4 text-xs font-semibold text-[#2563eb]"
              >
                Manage question bank
                <ChevronRight className="size-4" />
              </Link>
            </section>

            <section className="rounded-2xl border border-[#dce3ec] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{t('admin.promptsTitle')}</h3>
                  <p className="mt-1 text-xs text-slate-400">Latest learner activity</p>
                </div>
                <MessageSquareText className="size-4 text-[#2563eb]" />
              </div>

              {prompts.length === 0 ? (
                <p className="mt-5 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  {t('admin.promptsEmpty')}
                </p>
              ) : (
                <ul className="mt-5 max-h-[30rem] space-y-4 overflow-y-auto pr-1">
                  {prompts.map((prompt) => (
                    <li
                      key={prompt.id}
                      className="border-b border-[#e8edf3] pb-4 last:border-0 last:pb-0"
                    >
                      <div className="line-clamp-3 text-sm leading-5 text-slate-600">
                        {prompt.promptText}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Clock3 className="size-3" />
                        {new Date(prompt.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/admin/learners"
                className="mt-5 flex items-center justify-between border-t border-[#e8edf3] pt-4 text-xs font-semibold text-[#2563eb]"
              >
                {t('admin.promptsSeeLearners')}
                <ChevronRight className="size-4" />
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
