/**
 * App entry for the package-owned single-call PBL planner.
 * Prepends the Ground School domain brief so eval / alternate planners
 * stay aligned with outline and tool-loop generation.
 */
import {
  generatePBLV2ProjectSingleCall as generatePackage,
  type PlannerSingleCallFn,
} from '@openmaic/generation';
import type { PBLPlannerV2Input, PBLProjectV2 } from '@/lib/types/stage';
import { withGenerationSystemPrompt } from '@/lib/ground-school/generation-system-prompt';

export type { PlannerSingleCallFn };

export async function generatePBLV2ProjectSingleCall(
  input: PBLPlannerV2Input,
  aiCall: PlannerSingleCallFn,
): Promise<PBLProjectV2> {
  const wrapped: PlannerSingleCallFn = async (system, prompt) =>
    aiCall(withGenerationSystemPrompt(system), prompt);
  return generatePackage(input, wrapped);
}
