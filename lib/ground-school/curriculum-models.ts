/**
 * Authorized chat models for curriculum candidate generation.
 *
 * Selection is stored on the generation run as `llmModel` and applied via the
 * run LLM override — it does not require the workspace `llm` slot to be unlocked.
 */
import { deploymentConfig } from '@/lib/server/model-config/runtime';
import { deploymentAuthorizedModels } from '@/lib/server/model-config/model-authorization';

export interface CurriculumModelOption {
  /** `provider:model` reference used by slots. */
  id: string;
  providerId: string;
  modelId: string;
  label: string;
}

/** Chat models authorized by the deployment allowlist (server-paid). */
export function listCurriculumChatModels(): CurriculumModelOption[] {
  const { layer } = deploymentConfig();
  const config = layer?.config;
  if (!config?.providers) return [];

  const options: CurriculumModelOption[] = [];
  for (const [providerId] of Object.entries(config.providers)) {
    const models = deploymentAuthorizedModels(config, providerId, 'chat');
    for (const modelId of models) {
      options.push({
        id: `${providerId}:${modelId}`,
        providerId,
        modelId,
        label: `${providerId} / ${modelId}`,
      });
    }
  }
  options.sort((a, b) => a.id.localeCompare(b.id));
  return options;
}

export function currentCurriculumLlmModel(): string | null {
  const { layer } = deploymentConfig();
  const llm = layer?.config.slots?.llm;
  if (typeof llm === 'string') return llm;
  if (llm && typeof llm === 'object' && typeof llm.model === 'string') return llm.model;
  return null;
}

/** Validate a picker choice against the deployment allowlist. */
export function resolveCurriculumLlmModel(modelRef: string): string {
  const allowed = listCurriculumChatModels();
  const match = allowed.find((m) => m.id === modelRef);
  if (!match) {
    throw Object.assign(new Error(`Model is not authorized: ${modelRef}`), {
      name: 'CurriculumModelRefusal',
      code: 'MODEL_NOT_AUTHORIZED',
      status: 400,
    });
  }
  return match.id;
}
