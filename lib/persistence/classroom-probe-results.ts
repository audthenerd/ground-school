/**
 * Assessor probe-pack marks — interview evidence only (not OQ standing).
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';
import { applySchemaMigrations, type SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

import type { OqDimension } from '@/lib/ground-school/assessment-level';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

export interface ClassroomProbeResultRow {
  id: string;
  stageId: string;
  sceneId: string;
  learnerOwnerId: string;
  assessmentLevel: 'L2' | 'L3';
  dimension: OqDimension;
  passed: boolean;
  evidenceNote: string;
  assessorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CLASSROOM_PROBE_RESULTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS classroom_probe_results (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  learner_owner_id TEXT NOT NULL,
  assessment_level TEXT NOT NULL
    CHECK (assessment_level IN ('L2', 'L3')),
  dimension TEXT NOT NULL
    CHECK (dimension IN ('E', 'M', 'I')),
  passed BOOLEAN NOT NULL,
  evidence_note TEXT NOT NULL,
  assessor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, scene_id, learner_owner_id, dimension)
);

CREATE INDEX IF NOT EXISTS classroom_probe_results_learner_idx
  ON classroom_probe_results (learner_owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS classroom_probe_results_stage_idx
  ON classroom_probe_results (stage_id, learner_owner_id);
`;

export const CLASSROOM_PROBE_RESULTS_MIGRATIONS: SchemaMigrationSet = {
  store: 'classroom_probe_results',
  migrations: [
    { version: 1, name: 'baseline', up: CLASSROOM_PROBE_RESULTS_SCHEMA, transaction: false },
  ],
};

export async function ensureClassroomProbeResultsSchema(queryable: Queryable): Promise<void> {
  await applySchemaMigrations(queryable, CLASSROOM_PROBE_RESULTS_MIGRATIONS);
}

async function probeDb(): Promise<Queryable> {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  await ensureClassroomProbeResultsSchema(pool as unknown as Queryable);
  return pool as unknown as Queryable;
}

interface RawRow extends Record<string, unknown> {
  id: string;
  stage_id: string;
  scene_id: string;
  learner_owner_id: string;
  assessment_level: string;
  dimension: string;
  passed: boolean;
  evidence_note: string;
  assessor_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapRow(row: RawRow): ClassroomProbeResultRow {
  return {
    id: row.id,
    stageId: row.stage_id,
    sceneId: row.scene_id,
    learnerOwnerId: row.learner_owner_id,
    assessmentLevel: row.assessment_level as 'L2' | 'L3',
    dimension: row.dimension as OqDimension,
    passed: row.passed,
    evidenceNote: row.evidence_note,
    assessorId: row.assessor_id,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

const SELECT_COLS = `id, stage_id, scene_id, learner_owner_id, assessment_level, dimension,
  passed, evidence_note, assessor_id, created_at, updated_at`;

export async function upsertClassroomProbeResults(input: {
  stageId: string;
  sceneId: string;
  learnerOwnerId: string;
  assessmentLevel: 'L2' | 'L3';
  assessorId: string;
  results: Array<{ dimension: OqDimension; passed: boolean; evidenceNote: string }>;
}): Promise<ClassroomProbeResultRow[]> {
  const db = await probeDb();
  const out: ClassroomProbeResultRow[] = [];
  for (const result of input.results) {
    const id = randomUUID();
    const r = await db.query<RawRow>(
      `INSERT INTO classroom_probe_results (
         id, stage_id, scene_id, learner_owner_id, assessment_level, dimension,
         passed, evidence_note, assessor_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
       ON CONFLICT (stage_id, scene_id, learner_owner_id, dimension) DO UPDATE
         SET passed = EXCLUDED.passed,
             evidence_note = EXCLUDED.evidence_note,
             assessor_id = EXCLUDED.assessor_id,
             assessment_level = EXCLUDED.assessment_level,
             updated_at = now()
       RETURNING ${SELECT_COLS}`,
      [
        id,
        input.stageId,
        input.sceneId,
        input.learnerOwnerId,
        input.assessmentLevel,
        result.dimension,
        result.passed,
        result.evidenceNote,
        input.assessorId,
      ],
    );
    out.push(mapRow(r.rows[0]!));
  }
  return out;
}

export async function listClassroomProbeResultsForLearner(
  learnerOwnerId: string,
): Promise<ClassroomProbeResultRow[]> {
  const db = await probeDb();
  const result = await db.query<RawRow>(
    `SELECT ${SELECT_COLS}
       FROM classroom_probe_results
      WHERE learner_owner_id = $1
      ORDER BY updated_at DESC`,
    [learnerOwnerId],
  );
  return result.rows.map(mapRow);
}

export async function listClassroomProbeResultsForStageLearner(input: {
  stageId: string;
  sceneId: string;
  learnerOwnerId: string;
}): Promise<ClassroomProbeResultRow[]> {
  const db = await probeDb();
  const result = await db.query<RawRow>(
    `SELECT ${SELECT_COLS}
       FROM classroom_probe_results
      WHERE stage_id = $1 AND scene_id = $2 AND learner_owner_id = $3
      ORDER BY dimension ASC`,
    [input.stageId, input.sceneId, input.learnerOwnerId],
  );
  return result.rows.map(mapRow);
}
