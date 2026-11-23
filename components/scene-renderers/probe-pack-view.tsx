'use client';

/**
 * Assessor probe pack — F2F interview instrument for L2/L3.
 * Learners see a high-level preview; admins see rubrics and can record marks.
 * Marks do not award Capable / Lead-Capable standing.
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '@/lib/hooks/use-auth-session';
import type { OqDimension, ProbePackContent } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

interface ProbeMark {
  dimension: OqDimension;
  passed: boolean | null;
  evidenceNote: string;
}

interface ProbePackViewProps {
  content: ProbePackContent;
  sceneId: string;
  stageId: string;
}

const DIMENSION_LABEL: Record<OqDimension, string> = {
  E: 'Operational empathy',
  M: 'Warfighter mindset',
  I: 'Innovation & design',
};

export function ProbePackView({ content, sceneId, stageId }: ProbePackViewProps) {
  const { session } = useAuthSession();
  const isAdmin = session?.authenticated === true && session.isAdmin === true;

  const [marks, setMarks] = useState<ProbeMark[]>(() =>
    content.probes.map((probe) => ({
      dimension: probe.dimension,
      passed: null,
      evidenceNote: '',
    })),
  );
  const [learnerId, setLearnerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMarks(
      content.probes.map((probe) => ({
        dimension: probe.dimension,
        passed: null,
        evidenceNote: '',
      })),
    );
    setSavedAt(null);
    setError(null);
  }, [content, sceneId]);

  const updateMark = useCallback((dimension: OqDimension, patch: Partial<ProbeMark>) => {
    setMarks((prev) =>
      prev.map((mark) => (mark.dimension === dimension ? { ...mark, ...patch } : mark)),
    );
  }, []);

  const saveMarks = async () => {
    if (!isAdmin) return;
    if (!learnerId.trim()) {
      setError('Enter the learner owner id before saving marks.');
      return;
    }
    const incomplete = marks.some((m) => m.passed === null || !m.evidenceNote.trim());
    if (incomplete) {
      setError('Each dimension needs pass/fail and an evidence note.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/classroom/probe-results', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stageId,
          sceneId,
          learnerOwnerId: learnerId.trim(),
          assessmentLevel: content.assessmentLevel,
          results: marks.map((m) => ({
            dimension: m.dimension,
            passed: m.passed === true,
            evidenceNote: m.evidenceNote.trim(),
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Failed to save probe results');
      }
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="probe-pack-view"
      className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950 px-4 py-6 md:px-8"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border border-amber-300/80 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
            {content.assessmentLevel} assessor probe pack
          </div>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">{content.banner}</p>
        </div>

        {!isAdmin ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This scene is the F2F interview script. Your assessor will run these probes live.
            Completing them does not change your standing in the app.
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
            <label className="block text-xs font-medium text-slate-500">
              Learner owner id
              <input
                data-testid="probe-pack-learner-id"
                value={learnerId}
                onChange={(e) => setLearnerId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 text-sm"
                placeholder="Paste learner owner id"
              />
            </label>
          </div>
        )}

        <div className="space-y-4">
          {content.probes.map((probe) => {
            const mark = marks.find((m) => m.dimension === probe.dimension);
            return (
              <article
                key={probe.id}
                data-testid={`probe-${probe.dimension}`}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                    {probe.dimension}
                  </span>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{probe.title}</h3>
                  <span className="text-xs text-slate-400">
                    {DIMENSION_LABEL[probe.dimension]}
                    {probe.bloomsLevel ? ` · ${probe.bloomsLevel}` : ''}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {probe.stem}
                </p>
                {isAdmin ? (
                  <>
                    <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400">
                        What good looks like
                      </div>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                        {probe.goodLooksLike}
                      </p>
                      {probe.notesForAssessor ? (
                        <p className="mt-2 text-xs text-slate-500">{probe.notesForAssessor}</p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateMark(probe.dimension, { passed: true })}
                        className={cn(
                          'h-8 px-3 rounded-md text-xs font-medium border',
                          mark?.passed === true
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        onClick={() => updateMark(probe.dimension, { passed: false })}
                        className={cn(
                          'h-8 px-3 rounded-md text-xs font-medium border',
                          mark?.passed === false
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      >
                        Fail
                      </button>
                    </div>
                    <textarea
                      value={mark?.evidenceNote ?? ''}
                      onChange={(e) =>
                        updateMark(probe.dimension, { evidenceNote: e.target.value })
                      }
                      rows={3}
                      placeholder="Evidence note (required)"
                      className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                    />
                  </>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Dimension {probe.dimension} — details revealed to the assessor during F2F.
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="probe-pack-save"
              onClick={() => void saveMarks()}
              disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save interview evidence'}
            </button>
            {savedAt ? (
              <span className="text-xs text-emerald-600">
                Saved {new Date(savedAt).toLocaleString()} — not a standing change
              </span>
            ) : null}
            {error ? <span className="text-xs text-red-600">{error}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
