/**
 * Shared RSAF Commands curriculum: candidate classrooms and the one approved
 * release every student opens via Start Mission.
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';
import { applySchemaMigrations, type SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { setStagePublished } from '@/lib/persistence/stage-meta';

export const CURRICULUM_SLOT_RSAF_COMMANDS = 'rsaf-commands' as const;
export type CurriculumSlot = typeof CURRICULUM_SLOT_RSAF_COMMANDS;

export const CURRICULUM_CANDIDATE_STATUSES = [
  'generating',
  'ready',
  'failed',
  'superseded',
] as const;
export type CurriculumCandidateStatus = (typeof CURRICULUM_CANDIDATE_STATUSES)[number];

export interface CurriculumCandidateRow {
  id: string;
  slot: string;
  stageId: string | null;
  runId: string;
  createdBy: string;
  createdAt: Date;
  label: string | null;
  status: CurriculumCandidateStatus;
}

export interface CurriculumReleaseRow {
  slot: string;
  stageId: string;
  candidateId: string;
  approvedBy: string;
  approvedAt: Date;
}

export const CURRICULUM_SCHEMA = `
CREATE TABLE IF NOT EXISTS curriculum_candidates (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  stage_id TEXT,
  run_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  label TEXT,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'failed', 'superseded'))
);

CREATE INDEX IF NOT EXISTS curriculum_candidates_slot_created_idx
  ON curriculum_candidates (slot, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_candidates_run_idx
  ON curriculum_candidates (run_id);

CREATE TABLE IF NOT EXISTS curriculum_releases (
  slot TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES curriculum_candidates(id),
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export const CURRICULUM_MIGRATIONS: SchemaMigrationSet = {
  store: 'curriculum',
  migrations: [{ version: 1, name: 'baseline', up: CURRICULUM_SCHEMA, transaction: false }],
};

export async function ensureCurriculumSchema(queryable: Queryable): Promise<void> {
  await applySchemaMigrations(queryable, CURRICULUM_MIGRATIONS);
}

async function curriculumDb(): Promise<Queryable> {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  await ensureCurriculumSchema(pool as unknown as Queryable);
  return pool as unknown as Queryable;
}

interface RawCandidate extends Record<string, unknown> {
  id: string;
  slot: string;
  stage_id: string | null;
  run_id: string;
  created_by: string;
  created_at: Date | string;
  label: string | null;
  status: string;
}

interface RawRelease extends Record<string, unknown> {
  slot: string;
  stage_id: string;
  candidate_id: string;
  approved_by: string;
  approved_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapCandidate(row: RawCandidate): CurriculumCandidateRow {
  return {
    id: row.id,
    slot: row.slot,
    stageId: row.stage_id,
    runId: row.run_id,
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    label: row.label,
    status: row.status as CurriculumCandidateStatus,
  };
}

function mapRelease(row: RawRelease): CurriculumReleaseRow {
  return {
    slot: row.slot,
    stageId: row.stage_id,
    candidateId: row.candidate_id,
    approvedBy: row.approved_by,
    approvedAt: toDate(row.approved_at),
  };
}

export async function insertCurriculumCandidate(input: {
  slot: CurriculumSlot;
  runId: string;
  createdBy: string;
  label?: string;
}): Promise<CurriculumCandidateRow> {
  const db = await curriculumDb();
  const id = randomUUID();
  const result = await db.query<RawCandidate>(
    `INSERT INTO curriculum_candidates (id, slot, run_id, created_by, label, status)
     VALUES ($1, $2, $3, $4, $5, 'generating')
     RETURNING id, slot, stage_id, run_id, created_by, created_at, label, status`,
    [id, input.slot, input.runId, input.createdBy, input.label ?? null],
  );
  return mapCandidate(result.rows[0]!);
}

export async function listCurriculumCandidates(
  slot: CurriculumSlot,
): Promise<CurriculumCandidateRow[]> {
  const db = await curriculumDb();
  const result = await db.query<RawCandidate>(
    `SELECT id, slot, stage_id, run_id, created_by, created_at, label, status
       FROM curriculum_candidates
      WHERE slot = $1
      ORDER BY created_at DESC`,
    [slot],
  );
  return result.rows.map(mapCandidate);
}

export async function getCurriculumCandidate(
  candidateId: string,
): Promise<CurriculumCandidateRow | null> {
  const db = await curriculumDb();
  const result = await db.query<RawCandidate>(
    `SELECT id, slot, stage_id, run_id, created_by, created_at, label, status
       FROM curriculum_candidates
      WHERE id = $1`,
    [candidateId],
  );
  const row = result.rows[0];
  return row ? mapCandidate(row) : null;
}

export async function updateCurriculumCandidate(
  candidateId: string,
  patch: { stageId?: string | null; status?: CurriculumCandidateStatus },
): Promise<CurriculumCandidateRow | null> {
  if (patch.stageId === undefined && patch.status === undefined) {
    return getCurriculumCandidate(candidateId);
  }
  const db = await curriculumDb();
  if (patch.stageId !== undefined && patch.status !== undefined) {
    const r = await db.query<RawCandidate>(
      `UPDATE curriculum_candidates SET stage_id = $2, status = $3
        WHERE id = $1
        RETURNING id, slot, stage_id, run_id, created_by, created_at, label, status`,
      [candidateId, patch.stageId, patch.status],
    );
    return r.rows[0] ? mapCandidate(r.rows[0]) : null;
  }
  if (patch.stageId !== undefined) {
    const r = await db.query<RawCandidate>(
      `UPDATE curriculum_candidates SET stage_id = $2
        WHERE id = $1
        RETURNING id, slot, stage_id, run_id, created_by, created_at, label, status`,
      [candidateId, patch.stageId],
    );
    return r.rows[0] ? mapCandidate(r.rows[0]) : null;
  }
  const r = await db.query<RawCandidate>(
    `UPDATE curriculum_candidates SET status = $2
      WHERE id = $1
      RETURNING id, slot, stage_id, run_id, created_by, created_at, label, status`,
    [candidateId, patch.status],
  );
  return r.rows[0] ? mapCandidate(r.rows[0]) : null;
}

export async function getCurriculumRelease(
  slot: CurriculumSlot,
): Promise<CurriculumReleaseRow | null> {
  const db = await curriculumDb();
  const result = await db.query<RawRelease>(
    `SELECT slot, stage_id, candidate_id, approved_by, approved_at
       FROM curriculum_releases
      WHERE slot = $1`,
    [slot],
  );
  const row = result.rows[0];
  return row ? mapRelease(row) : null;
}

/**
 * Approve a ready candidate as the live release for `slot`. Publishes the
 * stage and marks other non-failed candidates for the slot as superseded.
 */
export async function approveCurriculumCandidate(input: {
  slot: CurriculumSlot;
  candidateId: string;
  approvedBy: string;
}): Promise<CurriculumReleaseRow> {
  const db = await curriculumDb();
  const candidate = await getCurriculumCandidate(input.candidateId);
  if (!candidate || candidate.slot !== input.slot) {
    throw new CurriculumApproveError('not_found', 'Candidate not found');
  }
  if (candidate.status !== 'ready' || !candidate.stageId) {
    throw new CurriculumApproveError(
      'not_ready',
      'Candidate must be ready with a completed classroom before approval',
    );
  }

  const publishedAt = Date.now();
  await setStagePublished(db, candidate.stageId, true, publishedAt);

  await db.query(
    `UPDATE curriculum_candidates
        SET status = 'superseded'
      WHERE slot = $1
        AND id <> $2
        AND status IN ('generating', 'ready')`,
    [input.slot, candidate.id],
  );

  const result = await db.query<RawRelease>(
    `INSERT INTO curriculum_releases (slot, stage_id, candidate_id, approved_by, approved_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (slot) DO UPDATE
       SET stage_id = EXCLUDED.stage_id,
           candidate_id = EXCLUDED.candidate_id,
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at
     RETURNING slot, stage_id, candidate_id, approved_by, approved_at`,
    [input.slot, candidate.stageId, candidate.id, input.approvedBy],
  );

  return mapRelease(result.rows[0]!);
}

export class CurriculumApproveError extends Error {
  constructor(
    readonly code: 'not_found' | 'not_ready',
    message: string,
  ) {
    super(message);
    this.name = 'CurriculumApproveError';
  }
}
