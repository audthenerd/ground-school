'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, RefreshCw, Users } from 'lucide-react';

import type { LearnerSummary, LearnerTimelineEvent } from '@/lib/admin/learner-timeline';
import { useAuthSession } from '@/lib/hooks/use-auth-session';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export default function AdminLearnersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { status: authStatus, session } = useAuthSession();
  const isAdmin = session?.authenticated === true && session.isAdmin === true;

  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [stageId, setStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<LearnerTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/learners', { credentials: 'same-origin' });
      if (res.status === 403) {
        router.replace('/');
        return;
      }
      if (!res.ok) throw new Error('Failed to load learners');
      const body = (await res.json()) as {
        stageId: string | null;
        learners?: LearnerSummary[];
      };
      setStageId(body.stageId);
      setLearners(body.learners ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadTimeline = useCallback(async (ownerId: string) => {
    setTimelineLoading(true);
    setTimeline([]);
    try {
      const res = await fetch(
        `/api/admin/learners?ownerId=${encodeURIComponent(ownerId)}&limit=200`,
        { credentials: 'same-origin' },
      );
      if (!res.ok) throw new Error('Failed to load timeline');
      const body = (await res.json()) as { timeline?: LearnerTimelineEvent[] };
      setTimeline(body.timeline ?? []);
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'ready' && isAdmin) void load();
    if (authStatus === 'ready' && !isAdmin) router.replace('/');
  }, [authStatus, isAdmin, load, router]);

  const toggleOwner = (ownerId: string) => {
    if (expandedOwnerId === ownerId) {
      setExpandedOwnerId(null);
      setTimeline([]);
      return;
    }
    setExpandedOwnerId(ownerId);
    void loadTimeline(ownerId);
  };

  if (authStatus === 'loading' || (authStatus === 'ready' && !isAdmin && loading)) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-slate-500">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div
      data-testid="admin-learners-page"
      className="ground-home min-h-[100dvh] w-full px-4 py-8 md:px-8 max-w-5xl mx-auto"
    >
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <Link
            href="/admin/curriculum"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
          >
            <ArrowLeft className="size-4" />
            {t('admin.backCurriculum')}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="size-6 text-primary" />
            {t('admin.learnersTitle')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('admin.learnersSubtitle')}
          </p>
          {stageId ? (
            <p className="mt-1 text-xs font-mono text-slate-400 truncate">stage {stageId}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Refresh"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          {t('admin.learnersLoading')}
        </div>
      ) : learners.length === 0 ? (
        <p className="text-sm text-slate-500">{t('admin.learnersEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {learners.map((learner) => {
            const open = expandedOwnerId === learner.ownerId;
            return (
              <li
                key={learner.ownerId}
                className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleOwner(learner.ownerId)}
                  className="w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60"
                >
                  {open ? (
                    <ChevronDown className="size-4 mt-0.5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="size-4 mt-0.5 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm truncate">{learner.ownerId}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        {t('admin.learnersVisits')}: {learner.visitCount} (
                        {formatDuration(learner.totalDwellMs)})
                      </span>
                      <span>
                        {t('admin.learnersQuiz')}:{' '}
                        {learner.latestQuizEarned != null && learner.latestQuizTotal != null
                          ? `${learner.latestQuizEarned}/${learner.latestQuizTotal}`
                          : '—'}
                        {learner.quizCount > 1 ? ` ×${learner.quizCount}` : ''}
                      </span>
                      <span>
                        {t('admin.learnersPrompts')}: {learner.promptCount}
                      </span>
                      <span>
                        {t('admin.learnersLastActive')}:{' '}
                        {learner.lastActiveAt
                          ? new Date(learner.lastActiveAt).toLocaleString()
                          : '—'}
                      </span>
                    </div>
                  </div>
                </button>
                {open ? (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 px-3 py-3">
                    {timelineLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="size-4 animate-spin" />
                        {t('admin.learnersTimelineLoading')}
                      </div>
                    ) : timeline.length === 0 ? (
                      <p className="text-sm text-slate-500">{t('admin.learnersTimelineEmpty')}</p>
                    ) : (
                      <ol className="space-y-2">
                        {timeline.map((event) => (
                          <li
                            key={`${event.kind}-${event.id}`}
                            className={cn(
                              'rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm',
                            )}
                          >
                            <div className="text-xs font-mono text-slate-400 mb-1">
                              {new Date(event.at).toLocaleString()} · {event.kind}
                              {event.sceneId ? ` · scene ${event.sceneId}` : ''}
                            </div>
                            {event.kind === 'visit' ? (
                              <div>
                                {event.sceneType ?? 'scene'} · dwell{' '}
                                {event.durationMs != null
                                  ? formatDuration(event.durationMs)
                                  : t('admin.learnersDwellOpen')}
                              </div>
                            ) : null}
                            {event.kind === 'quiz_score' ? (
                              <div>
                                <div>
                                  {t('admin.learnersQuizScore')}: {event.earned}/{event.total}
                                </div>
                                {event.bloomsBreakdown ? (
                                  <div className="mt-2 text-xs">
                                    <div className="font-medium text-slate-600 dark:text-slate-300 mb-1">
                                      {t('admin.bloomsBreakdown')}:
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                                      {(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const).map(
                                        (level) => {
                                          const data = event.bloomsBreakdown?.[level];
                                          if (!data) return null;
                                          return (
                                            <div key={level} className="flex justify-between">
                                              <span className="capitalize text-slate-500">{level}:</span>
                                              <span className={data.earned === data.total ? 'text-green-600' : 'text-slate-700 dark:text-slate-300'}>
                                                {data.earned}/{data.total}
                                              </span>
                                            </div>
                                          );
                                        },
                                      )}
                                      {event.bloomsBreakdown?.unclassified ? (
                                        <div className="flex justify-between">
                                          <span className="text-slate-400">{t('admin.bloomsUnclassified')}:</span>
                                          <span className="text-slate-700 dark:text-slate-300">
                                            {event.bloomsBreakdown.unclassified.earned}/{event.bloomsBreakdown.unclassified.total}
                                          </span>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {event.kind === 'prompt' ? (
                              <div className="whitespace-pre-wrap break-words">
                                {event.promptText}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
