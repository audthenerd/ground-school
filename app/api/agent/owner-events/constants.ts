/** LISTEN/NOTIFY correctness fallback poll for owner session-summary SSE. */
export const OWNER_EVENT_POLL_INTERVAL_MS = 30_000;
/** Heartbeat so idle intermediaries keep the sparse stream open. */
export const SSE_HEARTBEAT_INTERVAL_MS = 25_000;
/** Max events replayed from a Last-Event-ID cursor on attach. */
export const OWNER_EVENT_REPLAY_LIMIT = 1_000;
