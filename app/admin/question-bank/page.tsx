'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Loader2, RefreshCw, Search } from 'lucide-react';

import type { QuestionBankItem } from '@/lib/ground-school/question-bank';
import { useAuthSession } from '@/lib/hooks/use-auth-session';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

const BLOOMS_LEVELS: BloomsLevel[] = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
];

const BLOOMS_COLORS: Record<BloomsLevel, string> = {
  remember: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  understand: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  apply: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  analyze: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  evaluate: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  create: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

const BLOOMS_DESCRIPTIONS: Record<BloomsLevel, string> = {
  remember: 'Recall facts: define, list, state',
  understand: 'Explain concepts: classify, describe, identify',
  apply: 'Use in new situations: execute, implement, solve',
  analyze: 'Draw connections: differentiate, compare, contrast',
  evaluate: 'Justify decisions: appraise, argue, judge',
  create: 'Produce original work: design, construct, formulate',
};

interface BloomsStats {
  remember: number;
  understand: number;
  apply: number;
  analyze: number;
  evaluate: number;
  create: number;
  unclassified: number;
}

export default function AdminQuestionBankPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { status: authStatus, session } = useAuthSession();
  const isAdmin = session?.authenticated === true && session.isAdmin === true;

  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [stats, setStats] = useState<BloomsStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bloomsFilter, setBloomsFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (bloomsFilter) params.set('bloomsLevel', bloomsFilter);

      const res = await fetch(`/api/admin/question-bank?${params}`, {
        credentials: 'same-origin',
      });

      if (res.status === 403) {
        router.replace('/');
        return;
      }
      if (!res.ok) throw new Error('Failed to load question bank');

      const body = (await res.json()) as {
        questions: QuestionBankItem[];
        total: number;
        bloomsStats: BloomsStats;
      };

      setQuestions(body.questions);
      setTotal(body.total);
      setStats(body.bloomsStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router, bloomsFilter]);

  useEffect(() => {
    if (authStatus === 'ready' && isAdmin) void load();
    if (authStatus === 'ready' && !isAdmin) router.replace('/');
  }, [authStatus, isAdmin, load, router]);

  const updateBloomsLevel = async (questionId: string, level: BloomsLevel | null) => {
    setSavingId(questionId);
    try {
      const res = await fetch('/api/admin/question-bank', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId, bloomsLevel: level }),
      });

      if (!res.ok) throw new Error('Failed to update');

      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, bloomsLevel: level } : q)),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingId(null);
    }
  };

  const filteredQuestions = searchQuery
    ? questions.filter(
        (q) =>
          q.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.topic.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : questions;

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
      data-testid="admin-question-bank-page"
      className="ground-home min-h-[100dvh] w-full px-4 py-8 md:px-8 max-w-6xl mx-auto"
    >
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <Link
            href="/admin/curriculum"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
          >
            <ArrowLeft className="size-4" />
            {t('admin.backCurriculum')}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BookOpen className="size-6 text-primary" />
            {t('admin.questionBankTitle') || 'Question Bank'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('admin.questionBankSubtitle') || "Manage Bloom's taxonomy levels for quiz questions"}
          </p>
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

      {/* Stats */}
      {stats ? (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {BLOOMS_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setBloomsFilter(bloomsFilter === level ? '' : level)}
              className={cn(
                'rounded-lg border px-3 py-2 text-center transition-colors',
                bloomsFilter === level
                  ? 'border-primary bg-primary/10'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              <div className="text-lg font-semibold">{stats[level]}</div>
              <div className="text-xs capitalize text-slate-500">{level}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBloomsFilter(bloomsFilter === 'unclassified' ? '' : 'unclassified')}
            className={cn(
              'rounded-lg border px-3 py-2 text-center transition-colors',
              bloomsFilter === 'unclassified'
                ? 'border-primary bg-primary/10'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
            )}
          >
            <div className="text-lg font-semibold">{stats.unclassified}</div>
            <div className="text-xs text-slate-500">Unclassified</div>
          </button>
        </div>
      ) : null}

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <input
          type="text"
          placeholder={t('admin.questionBankSearch') || 'Search by ID, question, or topic...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          <div className="mb-2 text-sm text-slate-500">
            Showing {filteredQuestions.length} of {total} questions
            {bloomsFilter && ` (filtered: ${bloomsFilter})`}
          </div>

          <div className="space-y-2">
            {filteredQuestions.map((question) => (
              <div
                key={question.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 font-mono text-xs text-slate-400 mt-1">
                    {question.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm mb-1">{question.question}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {question.topic}
                      </span>
                      {question.subtopic && (
                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {question.subtopic}
                        </span>
                      )}
                      <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {question.fieldType}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {editingId === question.id ? (
                      <div className="flex flex-wrap gap-1">
                        {BLOOMS_LEVELS.map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => updateBloomsLevel(question.id, level)}
                            disabled={savingId === question.id}
                            className={cn(
                              'px-2 py-1 rounded text-xs capitalize transition-colors',
                              BLOOMS_COLORS[level],
                              question.bloomsLevel === level && 'ring-2 ring-primary',
                            )}
                            title={BLOOMS_DESCRIPTIONS[level]}
                          >
                            {savingId === question.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              level
                            )}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateBloomsLevel(question.id, null)}
                          disabled={savingId === question.id}
                          className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-500"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingId(question.id)}
                        className={cn(
                          'px-2 py-1 rounded text-xs capitalize',
                          question.bloomsLevel
                            ? BLOOMS_COLORS[question.bloomsLevel]
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
                        )}
                      >
                        {question.bloomsLevel ?? 'Unclassified'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
