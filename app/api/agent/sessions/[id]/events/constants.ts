/** Active-session SSE fallback poll when NOTIFY is missed. */
export const POLL_INTERVAL_MS = 5_000;
/**
 * Terminal streams poll less often than active ones, but 10s is the ceiling.
 * The worst case is "session already terminal -> user steers".
 */
export const TERMINAL_POLL_INTERVAL_MS = 10_000;
