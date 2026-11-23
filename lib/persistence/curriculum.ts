/**
 * Shared RSAF Commands curriculum: candidate classrooms and approved
 * releases — one live release per (slot, assessment_level).
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';
import { applySchemaMigrations, type SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

import {
  type AssessmentLevel,
  parseAssessmentLevel,
} from '@/lib/ground-school/assessment-level';
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
  assessmentLevel: AssessmentLevel;
}

export interface CurriculumReleaseRow {
  slot: string;
  stageId: string;
  candidateId: string;
  approvedBy: string;
  approvedAt: Date;
  assessmentLevel: AssessmentLevel;
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

/** Add per-level releases: one approved classroom per (slot, assessment_level). */
export const CURRICULUM_ASSESSMENT_LEVEL_MIGRATION = `
ALTER TABLE curriculum_candidates
  ADD COLUMN IF NOT EXISTS assessment_level TEXT NOT NULL DEFAULT 'L1';

ALTER TABLE curriculum_releases
  ADD COLUMN IF NOT EXISTS assessment_level TEXT NOT NULL DEFAULT 'L1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'curriculum_candidates_assessment_level_check'
  ) THEN
    ALTER TABLE curriculum_candidates
      ADD CONSTRAINT curriculum_candidates_assessment_level_check
      CHECK (assessment_level IN ('L1', 'L2', 'L3'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'curriculum_releases_assessment_level_check'
  ) THEN
    ALTER TABLE curriculum_releases
      ADD CONSTRAINT curriculum_releases_assessment_level_check
      CHECK (assessment_level IN ('L1', 'L2', 'L3'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS curriculum_candidates_slot_level_created_idx
  ON curriculum_candidates (slot, assessment_level, created_at DESC);

ALTER TABLE curriculum_releases DROP CONSTRAINT IF EXISTS curriculum_releases_pkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'curriculum_releases_pkey'
  ) THEN
    ALTER TABLE curriculum_releases
      ADD CONSTRAINT curriculum_releases_pkey PRIMARY KEY (slot, assessment_level);
  END IF;
END $$;
`;

export const CURRICULUM_MIGRATIONS: SchemaMigrationSet = {
  store: 'curriculum',
  migrations: [
    { version: 1, name: 'baseline', up: CURRICULUM_SCHEMA, transaction: false },
    {
      version: 2,
      name: 'assessment_level',
      up: CURRICULUM_ASSESSMENT_LEVEL_MIGRATION,
      transaction: false,
    },
  ],
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
  assessment_level?: string | null;
}

interface RawRelease extends Record<string, unknown> {
  slot: string;
  stage_id: string;
  candidate_id: string;
  approved_by: string;
  approved_at: Date | string;
  assessment_level?: string | null;
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
    assessmentLevel: parseAssessmentLevel(row.assessment_level, 'L1'),
  };
}

function mapRelease(row: RawRelease): CurriculumReleaseRow {
  return {
    slot: row.slot,
    stageId: row.stage_id,
    candidateId: row.candidate_id,
    approvedBy: row.approved_by,
    approvedAt: toDate(row.approved_at),
    assessmentLevel: parseAssessmentLevel(row.assessment_level, 'L1'),
  };
}

const CANDIDATE_SELECT = `id, slot, stage_id, run_id, created_by, created_at, label, status, assessment_level`;
const RELEASE_SELECT = `slot, stage_id, candidate_id, approved_by, approved_at, assessment_level`;

export async function insertCurriculumCandidate(input: {
  slot: CurriculumSlot;
  runId: string;
  createdBy: string;
  label?: string;
  assessmentLevel?: AssessmentLevel;
}): Promise<CurriculumCandidateRow> {
  const db = await curriculumDb();
  const id = randomUUID();
  const level = input.assessmentLevel ?? 'L1';
  const result = await db.query<RawCandidate>(
    `INSERT INTO curriculum_candidates (id, slot, run_id, created_by, label, status, assessment_level)
     VALUES ($1, $2, $3, $4, $5, 'generating', $6)
     RETURNING ${CANDIDATE_SELECT}`,
    [id, input.slot, input.runId, input.createdBy, input.label ?? null, level],
  );
  return mapCandidate(result.rows[0]!);
}

export async function listCurriculumCandidates(
  slot: CurriculumSlot,
  assessmentLevel?: AssessmentLevel,
): Promise<CurriculumCandidateRow[]> {
  const db = await curriculumDb();
  if (assessmentLevel) {
    const result = await db.query<RawCandidate>(
      `SELECT ${CANDIDATE_SELECT}
         FROM curriculum_candidates
        WHERE slot = $1 AND assessment_level = $2
        ORDER BY created_at DESC`,
      [slot, assessmentLevel],
    );
    return result.rows.map(mapCandidate);
  }
  const result = await db.query<RawCandidate>(
    `SELECT ${CANDIDATE_SELECT}
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
    `SELECT ${CANDIDATE_SELECT}
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
        RETURNING ${CANDIDATE_SELECT}`,
      [candidateId, patch.stageId, patch.status],
    );
    return r.rows[0] ? mapCandidate(r.rows[0]) : null;
  }
  if (patch.stageId !== undefined) {
    const r = await db.query<RawCandidate>(
      `UPDATE curriculum_candidates SET stage_id = $2
        WHERE id = $1
        RETURNING ${CANDIDATE_SELECT}`,
      [candidateId, patch.stageId],
    );
    return r.rows[0] ? mapCandidate(r.rows[0]) : null;
  }
  const r = await db.query<RawCandidate>(
    `UPDATE curriculum_candidates SET status = $2
      WHERE id = $1
      RETURNING ${CANDIDATE_SELECT}`,
    [candidateId, patch.status],
  );
  return r.rows[0] ? mapCandidate(r.rows[0]) : null;
}

/** Live release for a slot+level (defaults to L1 for Start Mission compat). */
export async function getCurriculumRelease(
  slot: CurriculumSlot,
  assessmentLevel: AssessmentLevel = 'L1',
): Promise<CurriculumReleaseRow | null> {
  const db = await curriculumDb();
  const result = await db.query<RawRelease>(
    `SELECT ${RELEASE_SELECT}
       FROM curriculum_releases
      WHERE slot = $1 AND assessment_level = $2`,
    [slot, assessmentLevel],
  );
  const row = result.rows[0];
  return row ? mapRelease(row) : null;
}

/** All approved releases for a slot (up to one per level). */
export async function listCurriculumReleases(
  slot: CurriculumSlot,
): Promise<CurriculumReleaseRow[]> {
  const db = await curriculumDb();
  const result = await db.query<RawRelease>(
    `SELECT ${RELEASE_SELECT}
       FROM curriculum_releases
      WHERE slot = $1
      ORDER BY assessment_level ASC`,
    [slot],
  );
  return result.rows.map(mapRelease);
}

/**
 * Approve a ready candidate as the live release for its slot+level.
 * Publishes the stage and supersedes other non-failed candidates at that level.
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
        AND assessment_level = $2
        AND id <> $3
        AND status IN ('generating', 'ready')`,
    [input.slot, candidate.assessmentLevel, candidate.id],
  );

  const result = await db.query<RawRelease>(
    `INSERT INTO curriculum_releases (slot, stage_id, candidate_id, approved_by, approved_at, assessment_level)
     VALUES ($1, $2, $3, $4, now(), $5)
     ON CONFLICT (slot, assessment_level) DO UPDATE
       SET stage_id = EXCLUDED.stage_id,
           candidate_id = EXCLUDED.candidate_id,
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at
     RETURNING ${RELEASE_SELECT}`,
    [input.slot, candidate.stageId, candidate.id, input.approvedBy, candidate.assessmentLevel],
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

/**
 * Remove a candidate row. Clears the live release when it points at this
 * candidate (FK requires that order). Does not delete the stage document —
 * callers that own the stage should delete it separately.
 */
export async function deleteCurriculumCandidate(input: {
  slot: CurriculumSlot;
  candidateId: string;
}): Promise<{
  deleted: CurriculumCandidateRow;
  clearedRelease: boolean;
  stageId: string | null;
}> {
  const db = await curriculumDb();
  const candidate = await getCurriculumCandidate(input.candidateId);
  if (!candidate || candidate.slot !== input.slot) {
    throw new CurriculumDeleteError('not_found', 'Candidate not found');
  }

  const release = await getCurriculumRelease(input.slot, candidate.assessmentLevel);
  let clearedRelease = false;
  if (release?.candidateId === candidate.id) {
    await db.query(
      `DELETE FROM curriculum_releases WHERE slot = $1 AND assessment_level = $2`,
      [input.slot, candidate.assessmentLevel],
    );
    clearedRelease = true;
  }

  await db.query(`DELETE FROM curriculum_candidates WHERE id = $1`, [candidate.id]);

  return {
    deleted: candidate,
    clearedRelease,
    stageId: candidate.stageId,
  };
}

export class CurriculumDeleteError extends Error {
  constructor(
    readonly code: 'not_found',
    message: string,
  ) {
    super(message);
    this.name = 'CurriculumDeleteError';
  }
}
