/** How often the freshness stream re-checks the stage's revision. */
export const STAGE_FRESHNESS_POLL_INTERVAL_MS = 5_000;
/** Same ceiling as the sibling SSE streams. */
export const STAGE_FRESHNESS_HEARTBEAT_MS = 25_000;
/** Browser reconnect delay, sent as the SSE `retry:` field. */
export const STAGE_FRESHNESS_RETRY_MS = 3_000;
