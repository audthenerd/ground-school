'use client';

/**
 * Tracks scene enter/leave dwell while a classroom is mounted.
 * Subscribes to stage store currentSceneId so all navigation paths are covered.
 */
import { useEffect, useRef } from 'react';

import {
  mintVisitId,
  reportSceneVisitEnter,
  reportSceneVisitLeave,
} from '@/lib/classroom/learner-analytics';
import { useStageStore } from '@/lib/store/stage';

export function useLearnerAnalytics(enabled: boolean): void {
  const stageId = useStageStore((s) => s.stage?.id ?? null);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const activeVisitIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !stageId || !currentSceneId) return;

    const scene = useStageStore.getState().scenes.find((s) => s.id === currentSceneId);
    const visitId = mintVisitId();
    activeVisitIdRef.current = visitId;
    reportSceneVisitEnter({
      visitId,
      stageId,
      sceneId: currentSceneId,
      sceneType: scene?.type ?? null,
    });

    return () => {
      if (activeVisitIdRef.current === visitId) {
        reportSceneVisitLeave(visitId);
        activeVisitIdRef.current = null;
      }
    };
  }, [enabled, stageId, currentSceneId]);

  // Flush open visit on page hide / unload.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const visitId = activeVisitIdRef.current;
      if (!visitId) return;
      reportSceneVisitLeave(visitId);
      activeVisitIdRef.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled]);
}
