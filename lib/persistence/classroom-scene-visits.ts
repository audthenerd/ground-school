/**
 * Durable log of learner scene visits (enter/leave + dwell) on shared classrooms.
 *
 * Admin-readable analytics trail. Writes are best-effort and must never break
 * classroom navigation.
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';
import { applySchemaMigrations, type SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

export interface ClassroomSceneVisitRow {
  id: string;
  stageId: string;
  ownerId: string;
  sceneId: string;
  sceneType: string | null;
  enteredAt: Date;
  leftAt: Date | null;
  durationMs: number | null;
}

export const CLASSROOM_SCENE_VISITS_SCHEMA = `
CREATE TABLE IF NOT EXISTS classroom_scene_visits (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  scene_type TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS classroom_scene_visits_stage_entered_idx
  ON classroom_scene_visits (stage_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS classroom_scene_visits_stage_owner_idx
  ON classroom_scene_visits (stage_id, owner_id, entered_at DESC);
`;

export const CLASSROOM_SCENE_VISITS_MIGRATIONS: SchemaMigrationSet = {
  store: 'classroom-scene-visits',
  migrations: [
    { version: 1, name: 'baseline', up: CLASSROOM_SCENE_VISITS_SCHEMA, transaction: false },
  ],
};

export async function ensureClassroomSceneVisitsSchema(queryable: Queryable): Promise<void> {
  await applySchemaMigrations(queryable, CLASSROOM_SCENE_VISITS_MIGRATIONS);
}

async function visitsDb(): Promise<Queryable> {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  await ensureClassroomSceneVisitsSchema(pool as unknown as Queryable);
  return pool as unknown as Queryable;
}

interface RawVisit extends Record<string, unknown> {
  id: string;
  stage_id: string;
  owner_id: string;
  scene_id: string;
  scene_type: string | null;
  entered_at: Date | string;
  left_at: Date | string | null;
  duration_ms: number | null;
}

function mapVisit(row: RawVisit): ClassroomSceneVisitRow {
  return {
    id: row.id,
    stageId: row.stage_id,
    ownerId: row.owner_id,
    sceneId: row.scene_id,
    sceneType: row.scene_type,
    enteredAt: row.entered_at instanceof Date ? row.entered_at : new Date(row.entered_at),
    leftAt:
      row.left_at == null
        ? null
        : row.left_at instanceof Date
          ? row.left_at
          : new Date(row.left_at),
    durationMs: row.duration_ms,
  };
}

/** Open a new scene visit. Returns the visit id for a later leave. */
export async function openClassroomSceneVisit(input: {
  stageId: string;
  ownerId: string;
  sceneId: string;
  sceneType?: string | null;
  visitId?: string;
}): Promise<ClassroomSceneVisitRow> {
  const db = await visitsDb();
  const id = input.visitId?.trim() || randomUUID();
  const result = await db.query<RawVisit>(
    `INSERT INTO classroom_scene_visits
       (id, stage_id, owner_id, scene_id, scene_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, stage_id, owner_id, scene_id, scene_type, entered_at, left_at, duration_ms`,
    [id, input.stageId, input.ownerId, input.sceneId, input.sceneType ?? null],
  );
  return mapVisit(result.rows[0]!);
}

/** Close an open visit with leave time and dwell duration. */
export async function closeClassroomSceneVisit(input: {
  visitId: string;
  ownerId: string;
  leftAt?: Date;
}): Promise<ClassroomSceneVisitRow | null> {
  const db = await visitsDb();
  const leftAt = input.leftAt ?? new Date();
  const result = await db.query<RawVisit>(
    `UPDATE classroom_scene_visits
        SET left_at = $1,
            duration_ms = GREATEST(
              0,
              (EXTRACT(EPOCH FROM ($1::timestamptz - entered_at)) * 1000)::integer
            )
      WHERE id = $2
        AND owner_id = $3
        AND left_at IS NULL
      RETURNING id, stage_id, owner_id, scene_id, scene_type, entered_at, left_at, duration_ms`,
    [leftAt.toISOString(), input.visitId, input.ownerId],
  );
  const row = result.rows[0];
  return row ? mapVisit(row) : null;
}

export function openClassroomSceneVisitSafe(input: {
  stageId: string;
  ownerId: string;
  sceneId: string;
  sceneType?: string | null;
  visitId?: string;
}): void {
  void openClassroomSceneVisit(input).catch((error) => {
    console.warn('[classroom-scene-visits] failed to open visit', error);
  });
}

export function closeClassroomSceneVisitSafe(input: {
  visitId: string;
  ownerId: string;
  leftAt?: Date;
}): void {
  void closeClassroomSceneVisit(input).catch((error) => {
    console.warn('[classroom-scene-visits] failed to close visit', error);
  });
}

export async function listClassroomSceneVisits(input: {
  stageId: string;
  limit?: number;
  offset?: number;
  ownerId?: string;
}): Promise<{ visits: ClassroomSceneVisitRow[]; total: number }> {
  const db = await visitsDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);

  const params: unknown[] = [input.stageId];
  let ownerClause = '';
  if (input.ownerId) {
    params.push(input.ownerId);
    ownerClause = ` AND owner_id = $${params.length}`;
  }

  const countResult = await db.query<{ count: string } & Record<string, unknown>>(
    `SELECT COUNT(*)::text AS count FROM classroom_scene_visits WHERE stage_id = $1${ownerClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(limit, offset);
  const result = await db.query<RawVisit>(
    `SELECT id, stage_id, owner_id, scene_id, scene_type, entered_at, left_at, duration_ms
       FROM classroom_scene_visits
      WHERE stage_id = $1${ownerClause}
      ORDER BY entered_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { visits: result.rows.map(mapVisit), total };
}

/** Aggregate dwell + visit counts per owner for a stage. */
export async function summarizeClassroomSceneVisits(input: { stageId: string }): Promise<
  Array<{
    ownerId: string;
    visitCount: number;
    totalDwellMs: number;
    lastEnteredAt: Date;
  }>
> {
  const db = await visitsDb();
  const result = await db.query<
    {
      owner_id: string;
      visit_count: string;
      total_dwell_ms: string;
      last_entered_at: Date | string;
    } & Record<string, unknown>
  >(
    `SELECT owner_id,
            COUNT(*)::text AS visit_count,
            COALESCE(SUM(duration_ms), 0)::text AS total_dwell_ms,
            MAX(entered_at) AS last_entered_at
       FROM classroom_scene_visits
      WHERE stage_id = $1
      GROUP BY owner_id`,
    [input.stageId],
  );

  return result.rows.map((row) => ({
    ownerId: row.owner_id,
    visitCount: Number(row.visit_count),
    totalDwellMs: Number(row.total_dwell_ms),
    lastEnteredAt:
      row.last_entered_at instanceof Date ? row.last_entered_at : new Date(row.last_entered_at),
  }));
}
