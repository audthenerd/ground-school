/**
 * Per-run chat model override for generation (e.g. admin curriculum picker).
 *
 * Stored on {@link GenerationRunInput.llmModel} and applied while the runner
 * executes that claim, so locked deployment `llm` slots do not block switching
 * among authorized deployment models.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { languageModelFor } from '@/lib/server/model-config/llm';
import { deploymentConfig } from '@/lib/server/model-config/runtime';
import { resolveModelReference } from '@/lib/server/model-config/resolve-slot';
import type { ResolvedModel } from '@/lib/server/resolve-model';

const storage = new AsyncLocalStorage<string>();

/** Run `fn` with a chat model override (`provider:model`). */
export function withGenerationLlmOverride<T>(modelRef: string, fn: () => T): T {
  return storage.run(modelRef, fn);
}

export function generationLlmOverride(): string | undefined {
  return storage.getStore();
}

/**
 * Resolve an authorized deployment chat model for the current override, or
 * null when none is set.
 */
export async function resolveGenerationLlmOverride(): Promise<ResolvedModel | null> {
  const ref = generationLlmOverride();
  if (!ref) return null;
  const { layer } = deploymentConfig();
  if (!layer) {
    throw new Error(`No deployment model configuration to resolve ${ref}`);
  }
  const target = resolveModelReference(ref, 'chat', [layer]);
  return languageModelFor(target);
}
