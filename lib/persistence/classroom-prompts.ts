/**
 * Durable log of student chat prompts on shared classrooms.
 *
 * Separate from RuntimeStore chat history: this is an admin-readable audit of
 * user turns. Writes are best-effort and must never fail the chat stream.
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';
import { applySchemaMigrations, type SchemaMigrationSet } from '@openmaic/storage/pg-migrations';

import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

/** Truncate stored prompt text to keep rows bounded. */
export const CLASSROOM_PROMPT_MAX_CHARS = 16_384;

export interface ClassroomPromptRow {
  id: string;
  stageId: string;
  ownerId: string;
  sceneId: string | null;
  chatSessionId: string | null;
  promptText: string;
  createdAt: Date;
}

export const CLASSROOM_PROMPTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS classroom_prompts (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  scene_id TEXT,
  chat_session_id TEXT,
  prompt_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classroom_prompts_stage_created_idx
  ON classroom_prompts (stage_id, created_at DESC);

CREATE INDEX IF NOT EXISTS classroom_prompts_owner_idx
  ON classroom_prompts (owner_id, created_at DESC);
`;

export const CLASSROOM_PROMPTS_MIGRATIONS: SchemaMigrationSet = {
  store: 'classroom-prompts',
  migrations: [{ version: 1, name: 'baseline', up: CLASSROOM_PROMPTS_SCHEMA, transaction: false }],
};

export async function ensureClassroomPromptsSchema(queryable: Queryable): Promise<void> {
  await applySchemaMigrations(queryable, CLASSROOM_PROMPTS_MIGRATIONS);
}

async function promptsDb(): Promise<Queryable> {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  await ensureClassroomPromptsSchema(pool as unknown as Queryable);
  return pool as unknown as Queryable;
}

interface RawPrompt extends Record<string, unknown> {
  id: string;
  stage_id: string;
  owner_id: string;
  scene_id: string | null;
  chat_session_id: string | null;
  prompt_text: string;
  created_at: Date | string;
}

function mapPrompt(row: RawPrompt): ClassroomPromptRow {
  return {
    id: row.id,
    stageId: row.stage_id,
    ownerId: row.owner_id,
    sceneId: row.scene_id,
    chatSessionId: row.chat_session_id,
    promptText: row.prompt_text,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

export function truncatePromptText(text: string): string {
  if (text.length <= CLASSROOM_PROMPT_MAX_CHARS) return text;
  return text.slice(0, CLASSROOM_PROMPT_MAX_CHARS);
}

/** Insert one user prompt. Throws on persistence errors (callers should catch). */
export async function appendClassroomPrompt(input: {
  stageId: string;
  ownerId: string;
  sceneId?: string | null;
  chatSessionId?: string | null;
  promptText: string;
}): Promise<ClassroomPromptRow> {
  const text = truncatePromptText(input.promptText.trim());
  if (!text) {
    throw new Error('empty prompt');
  }
  const db = await promptsDb();
  const id = randomUUID();
  const result = await db.query<RawPrompt>(
    `INSERT INTO classroom_prompts
       (id, stage_id, owner_id, scene_id, chat_session_id, prompt_text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, stage_id, owner_id, scene_id, chat_session_id, prompt_text, created_at`,
    [
      id,
      input.stageId,
      input.ownerId,
      input.sceneId ?? null,
      input.chatSessionId ?? null,
      text,
    ],
  );
  return mapPrompt(result.rows[0]!);
}

/**
 * Best-effort append: swallows errors so chat SSE is never broken by logging.
 */
export function appendClassroomPromptSafe(input: {
  stageId: string;
  ownerId: string;
  sceneId?: string | null;
  chatSessionId?: string | null;
  promptText: string;
}): void {
  void appendClassroomPrompt(input).catch((error) => {
    console.warn('[classroom-prompts] failed to store prompt', error);
  });
}

export async function listClassroomPrompts(input: {
  stageId: string;
  limit?: number;
  offset?: number;
  ownerId?: string;
}): Promise<{ prompts: ClassroomPromptRow[]; total: number }> {
  const db = await promptsDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const params: unknown[] = [input.stageId];
  let ownerClause = '';
  if (input.ownerId) {
    params.push(input.ownerId);
    ownerClause = ` AND owner_id = $${params.length}`;
  }

  const countResult = await db.query<{ count: string } & Record<string, unknown>>(
    `SELECT COUNT(*)::text AS count FROM classroom_prompts WHERE stage_id = $1${ownerClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(limit, offset);
  const result = await db.query<RawPrompt>(
    `SELECT id, stage_id, owner_id, scene_id, chat_session_id, prompt_text, created_at
       FROM classroom_prompts
      WHERE stage_id = $1${ownerClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { prompts: result.rows.map(mapPrompt), total };
}
