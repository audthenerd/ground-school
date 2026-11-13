/**
 * Denormalized quiz score snapshots for admin analytics.
 *
 * Written when a learner reaches the reviewed phase. Separate from RuntimeStore
 * quizAttempt payloads so admins can list scores across owners without a
 * cross-learner RuntimeStore API.
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';
import { applySchemaMigrations, type SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import type { QuestionResult } from '@/lib/quiz/grading';

export interface ClassroomQuizScoreRow {
  id: string;
  stageId: string;
  ownerId: string;
  sceneId: string;
  attemptId: string;
  earned: number;
  total: number;
  results: QuestionResult[];
  createdAt: Date;
}

export const CLASSROOM_QUIZ_SCORES_SCHEMA = `
CREATE TABLE IF NOT EXISTS classroom_quiz_scores (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  earned DOUBLE PRECISION NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classroom_quiz_scores_stage_created_idx
  ON classroom_quiz_scores (stage_id, created_at DESC);

CREATE INDEX IF NOT EXISTS classroom_quiz_scores_stage_owner_idx
  ON classroom_quiz_scores (stage_id, owner_id, created_at DESC);
`;

export const CLASSROOM_QUIZ_SCORES_MIGRATIONS: SchemaMigrationSet = {
  store: 'classroom-quiz-scores',
  migrations: [
    { version: 1, name: 'baseline', up: CLASSROOM_QUIZ_SCORES_SCHEMA, transaction: false },
  ],
};

export async function ensureClassroomQuizScoresSchema(queryable: Queryable): Promise<void> {
  await applySchemaMigrations(queryable, CLASSROOM_QUIZ_SCORES_MIGRATIONS);
}

async function scoresDb(): Promise<Queryable> {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  await ensureClassroomQuizScoresSchema(pool as unknown as Queryable);
  return pool as unknown as Queryable;
}

interface RawScore extends Record<string, unknown> {
  id: string;
  stage_id: string;
  owner_id: string;
  scene_id: string;
  attempt_id: string;
  earned: number | string;
  total: number | string;
  results: QuestionResult[] | string;
  created_at: Date | string;
}

function parseResults(raw: QuestionResult[] | string): QuestionResult[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QuestionResult[]) : [];
  } catch {
    return [];
  }
}

function mapScore(row: RawScore): ClassroomQuizScoreRow {
  return {
    id: row.id,
    stageId: row.stage_id,
    ownerId: row.owner_id,
    sceneId: row.scene_id,
    attemptId: row.attempt_id,
    earned: Number(row.earned),
    total: Number(row.total),
    results: parseResults(row.results),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/** Insert one reviewed quiz score snapshot. */
export async function appendClassroomQuizScore(input: {
  stageId: string;
  ownerId: string;
  sceneId: string;
  attemptId: string;
  earned: number;
  total: number;
  results: QuestionResult[];
}): Promise<ClassroomQuizScoreRow> {
  const db = await scoresDb();
  const id = randomUUID();
  const result = await db.query<RawScore>(
    `INSERT INTO classroom_quiz_scores
       (id, stage_id, owner_id, scene_id, attempt_id, earned, total, results)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, stage_id, owner_id, scene_id, attempt_id, earned, total, results, created_at`,
    [
      id,
      input.stageId,
      input.ownerId,
      input.sceneId,
      input.attemptId,
      input.earned,
      input.total,
      JSON.stringify(input.results),
    ],
  );
  return mapScore(result.rows[0]!);
}

export function appendClassroomQuizScoreSafe(input: {
  stageId: string;
  ownerId: string;
  sceneId: string;
  attemptId: string;
  earned: number;
  total: number;
  results: QuestionResult[];
}): void {
  void appendClassroomQuizScore(input).catch((error) => {
    console.warn('[classroom-quiz-scores] failed to store score', error);
  });
}

export async function listClassroomQuizScores(input: {
  stageId: string;
  limit?: number;
  offset?: number;
  ownerId?: string;
}): Promise<{ scores: ClassroomQuizScoreRow[]; total: number }> {
  const db = await scoresDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);

  const params: unknown[] = [input.stageId];
  let ownerClause = '';
  if (input.ownerId) {
    params.push(input.ownerId);
    ownerClause = ` AND owner_id = $${params.length}`;
  }

  const countResult = await db.query<{ count: string } & Record<string, unknown>>(
    `SELECT COUNT(*)::text AS count FROM classroom_quiz_scores WHERE stage_id = $1${ownerClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(limit, offset);
  const result = await db.query<RawScore>(
    `SELECT id, stage_id, owner_id, scene_id, attempt_id, earned, total, results, created_at
       FROM classroom_quiz_scores
      WHERE stage_id = $1${ownerClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { scores: result.rows.map(mapScore), total };
}

export async function summarizeClassroomQuizScores(input: {
  stageId: string;
}): Promise<
  Array<{
    ownerId: string;
    quizCount: number;
    latestEarned: number;
    latestTotal: number;
    latestAt: Date;
  }>
> {
  const db = await scoresDb();
  const result = await db.query<
    {
      owner_id: string;
      quiz_count: string;
      latest_earned: number | string;
      latest_total: number | string;
      latest_at: Date | string;
    } & Record<string, unknown>
  >(
    `SELECT DISTINCT ON (owner_id)
            owner_id,
            COUNT(*) OVER (PARTITION BY owner_id)::text AS quiz_count,
            earned AS latest_earned,
            total AS latest_total,
            created_at AS latest_at
       FROM classroom_quiz_scores
      WHERE stage_id = $1
      ORDER BY owner_id, created_at DESC`,
    [input.stageId],
  );

  return result.rows.map((row) => ({
    ownerId: row.owner_id,
    quizCount: Number(row.quiz_count),
    latestEarned: Number(row.latest_earned),
    latestTotal: Number(row.latest_total),
    latestAt: row.latest_at instanceof Date ? row.latest_at : new Date(row.latest_at),
  }));
}
