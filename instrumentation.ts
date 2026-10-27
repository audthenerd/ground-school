/**
 * Process-scoped startup work.
 *
 * Next calls `register` once per server instance, before it serves a request.
 * That makes it the only place in this app where a background schedule can
 * live: a route module has no such guarantee — it can be instantiated more than
 * once and gets no shutdown hook — so anything periodic started from one is
 * really started per instantiation.
 *
 * Also invoked for the Edge runtime, which has neither `pg` nor timers we want;
 * the persistence stack is Node-only. Keep this file free of Node-only imports
 * (even dynamic ones Next can still trace into the Edge bundle) and forward to
 * `instrumentation.node.ts` only on the Node runtime.
 *
 * @see https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerNode } = await import('./instrumentation.node');
  await registerNode();
}
