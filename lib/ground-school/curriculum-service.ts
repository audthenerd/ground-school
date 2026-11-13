/**
 * Admin curriculum operations: start candidate generation runs, refresh
 * candidate status from generation runs, approve a shared release.
 */
import {
  approveCurriculumCandidate,
  CurriculumApproveError,
  CurriculumDeleteError,
  CURRICULUM_SLOT_RSAF_COMMANDS,
  deleteCurriculumCandidate as deleteCurriculumCandidateRow,
  getCurriculumCandidate,
  getCurriculumRelease,
  insertCurriculumCandidate,
  listCurriculumCandidates,
  updateCurriculumCandidate,
  type CurriculumCandidateRow,
  type CurriculumReleaseRow,
  type CurriculumSlot,
} from '@/lib/persistence/curriculum';
import {
  currentCurriculumLlmModel,
  listCurriculumChatModels,
  resolveCurriculumLlmModel,
  type CurriculumModelOption,
} from '@/lib/ground-school/curriculum-models';
import { SORTIE_REQUIREMENT } from '@/lib/ground-school/sortie-briefing';
import { createLogger } from '@/lib/logger';
import { getOwnerScopedDocumentStore } from '@/lib/server/agent-runtime/owner-scoped-documents';
import { parseRunInput } from '@/lib/server/generation/run/input';
import { startGenerationRun, startRefusal } from '@/lib/server/generation/run/start';
import {
  discardGenerationRun,
  readGenerationRun,
  RunCommandConflictError,
} from '@/lib/server/generation/run/store';
import type { OwnerPrincipal } from '@/lib/server/identity/types';
import { requiredModelRefusal } from '@/lib/server/generate-classroom-job';

export { CURRICULUM_SLOT_RSAF_COMMANDS, CurriculumApproveError, CurriculumDeleteError };
export type { CurriculumSlot };

const log = createLogger('CurriculumService');

export interface CurriculumCandidateView {
  id: string;
  slot: string;
  stageId: string | null;
  runId: string;
  createdBy: string;
  createdAt: string;
  label: string | null;
  status: CurriculumCandidateRow['status'];
  runState: string | null;
  scenesCompleted: number | null;
  scenesTotal: number | null;
  outlineTitle: string | null;
}

export interface CurriculumOverview {
  slot: typeof CURRICULUM_SLOT_RSAF_COMMANDS;
  release: {
    stageId: string;
    candidateId: string;
    approvedBy: string;
    approvedAt: string;
  } | null;
  candidates: CurriculumCandidateView[];
  /** Authorized chat models admins may pick for generation. */
  models: CurriculumModelOption[];
  /** Current deployment default / last-applied llm slot. */
  currentModel: string | null;
}

function releaseView(row: CurriculumReleaseRow) {
  return {
    stageId: row.stageId,
    candidateId: row.candidateId,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt.toISOString(),
  };
}

async function syncCandidateFromRun(
  candidate: CurriculumCandidateRow,
  ownerId: string,
): Promise<CurriculumCandidateView> {
  if (candidate.status === 'superseded') {
    return {
      id: candidate.id,
      slot: candidate.slot,
      stageId: candidate.stageId,
      runId: candidate.runId,
      createdBy: candidate.createdBy,
      createdAt: candidate.createdAt.toISOString(),
      label: candidate.label,
      status: candidate.status,
      runState: null,
      scenesCompleted: null,
      scenesTotal: null,
      outlineTitle: null,
    };
  }

  const run = await readGenerationRun(candidate.runId, ownerId);
  let status = candidate.status;
  let stageId = candidate.stageId;

  if (run) {
    stageId = run.stageId ?? stageId;
    if (run.state === 'completed' && run.stageId) {
      status = 'ready';
    } else if (run.state === 'paused' || run.state === 'ended') {
      status = 'failed';
    } else {
      status = 'generating';
    }

    if (status !== candidate.status || stageId !== candidate.stageId) {
      await updateCurriculumCandidate(candidate.id, { status, stageId });
    }
  }

  return {
    id: candidate.id,
    slot: candidate.slot,
    stageId,
    runId: candidate.runId,
    createdBy: candidate.createdBy,
    createdAt: candidate.createdAt.toISOString(),
    label: candidate.label,
    status,
    runState: run?.state ?? null,
    scenesCompleted: run?.progress.scenesCompleted ?? null,
    scenesTotal: run?.progress.scenesTotal ?? null,
    outlineTitle: run?.outline?.courseTitle ?? run?.outline?.outlines?.[0]?.title ?? null,
  };
}

export async function getCurriculumOverview(slot: CurriculumSlot): Promise<CurriculumOverview> {
  const [release, candidates] = await Promise.all([
    getCurriculumRelease(slot),
    listCurriculumCandidates(slot),
  ]);
  // Sync each candidate under its creator's owner id (run ownership).
  const views = await Promise.all(candidates.map((c) => syncCandidateFromRun(c, c.createdBy)));
  return {
    slot: CURRICULUM_SLOT_RSAF_COMMANDS,
    release: release ? releaseView(release) : null,
    candidates: views,
    models: listCurriculumChatModels(),
    currentModel: currentCurriculumLlmModel(),
  };
}

export async function createCurriculumCandidates(input: {
  principal: OwnerPrincipal;
  request: Request;
  count?: number;
  /** Optional `provider:model` from the deployment allowlist. */
  model?: string;
}): Promise<{ candidates: CurriculumCandidateView[]; model: string | null }> {
  const count = Math.min(Math.max(input.count ?? 3, 1), 5);
  const { ownerId } = input.principal;

  const refused = await requiredModelRefusal(ownerId);
  if (refused) {
    throw Object.assign(new Error(refused.message), {
      name: 'CurriculumModelRefusal',
      code: refused.code,
      status: 400,
    });
  }

  let appliedModel: string | null = currentCurriculumLlmModel();
  if (input.model?.trim()) {
    appliedModel = resolveCurriculumLlmModel(input.model.trim());
  }

  const parsed = parseRunInput({
    requirement: SORTIE_REQUIREMENT,
    materialIds: [],
    outlineReview: 'auto',
    ...(appliedModel ? { llmModel: appliedModel } : {}),
  });
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.message), {
      name: 'CurriculumInputError',
      code: 'INVALID_REQUEST',
      status: 400,
    });
  }

  const modelLabel = appliedModel ? ` · ${appliedModel}` : '';
  const created: CurriculumCandidateView[] = [];
  for (let i = 0; i < count; i += 1) {
    try {
      const run = await startGenerationRun(ownerId, parsed.value, {
        principal: input.principal,
        request: input.request,
        origin: 'generate-classroom',
      });
      const row = await insertCurriculumCandidate({
        slot: CURRICULUM_SLOT_RSAF_COMMANDS,
        runId: run.id,
        createdBy: ownerId,
        label: `Candidate ${i + 1}${modelLabel}`,
      });
      created.push(await syncCandidateFromRun(row, ownerId));
    } catch (error) {
      const refusal = startRefusal(error);
      if (refusal) {
        throw Object.assign(new Error(refusal.message), {
          name: 'CurriculumStartRefusal',
          code: refusal.code,
          status: refusal.status,
        });
      }
      throw error;
    }
  }

  return { candidates: created, model: appliedModel };
}

export async function approveCurriculumRelease(input: {
  candidateId: string;
  approvedBy: string;
}): Promise<CurriculumOverview['release']> {
  const candidate = await getCurriculumCandidate(input.candidateId);
  if (candidate) {
    // Refresh from the run before approving so a just-finished classroom is ready.
    await syncCandidateFromRun(candidate, candidate.createdBy);
  }
  const release = await approveCurriculumCandidate({
    slot: CURRICULUM_SLOT_RSAF_COMMANDS,
    candidateId: input.candidateId,
    approvedBy: input.approvedBy,
  });
  return releaseView(release);
}

export async function getPublicCurriculumStageId(
  slot: CurriculumSlot = CURRICULUM_SLOT_RSAF_COMMANDS,
): Promise<string | null> {
  const release = await getCurriculumRelease(slot);
  return release?.stageId ?? null;
}

/**
 * Delete a curriculum candidate classroom: clear live release if needed,
 * delete the stage document (or discard an in-progress run), then drop the row.
 */
export async function deleteCurriculumCandidate(input: {
  candidateId: string;
}): Promise<{ clearedRelease: boolean; stageId: string | null }> {
  const existing = await getCurriculumCandidate(input.candidateId);
  if (!existing || existing.slot !== CURRICULUM_SLOT_RSAF_COMMANDS) {
    throw new CurriculumDeleteError('not_found', 'Candidate not found');
  }

  const { deleted, clearedRelease, stageId } = await deleteCurriculumCandidateRow({
    slot: CURRICULUM_SLOT_RSAF_COMMANDS,
    candidateId: input.candidateId,
  });

  if (stageId) {
    try {
      const store = await getOwnerScopedDocumentStore(deleted.createdBy);
      await store.deleteDocument(stageId);
    } catch (error) {
      // Stage may already be gone; curriculum row is already removed.
      log.warn(`Failed to delete classroom stage ${stageId} for candidate ${deleted.id}`, error);
    }
  } else {
    try {
      await discardGenerationRun(deleted.runId, deleted.createdBy);
    } catch (error) {
      if (!(error instanceof RunCommandConflictError)) {
        log.warn(`Failed to discard run ${deleted.runId} for candidate ${deleted.id}`, error);
      }
    }
  }

  return { clearedRelease, stageId };
}
