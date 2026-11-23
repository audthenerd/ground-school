/**
 * Scene content: generate one scene's content (a slide, quiz, interactive
 * widget or PBL project) from its outline, with the outline's assigned
 * material images attached when the model sees images. Actions are the scene
 * actions step. The logic of 1.1.x's POST /api/generate/scene-content; the
 * caller resolves the model for the scene type's stage.
 */
import { prepareVisionImages } from '../vision-images';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent as generateContent,
  buildVisionUserContent,
  partitionImagesForVision,
} from '@openmaic/generation';
import type { AgentInfo } from '@openmaic/generation';
import type {
  SceneOutline,
  PdfImage,
  ImageMapping,
  UserRequirements,
} from '@/lib/types/generation';
import { resolveVocationalActive } from '@/lib/config/feature-flags';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { sortDocumentImagesForVision } from '@/lib/document/bundle';
import {
  buildProbePackContent,
  hasProbePack,
  quizDistributionForLevel,
} from '@/lib/ground-school/assessment-level';
import { SORTIE_QUIZ_QUESTION_COUNT } from '@/lib/ground-school/classroom-format';
import { withGenerationSystemPrompt } from '@/lib/ground-school/generation-system-prompt';
import { appendDraftQuestions, DEFAULT_SORTIE_TOPICS } from '@/lib/ground-school/question-bank';
import { sampleQuizQuestionsFromBank } from '@/lib/ground-school/question-bank-quiz';
import {
  assessmentLevelFromRequirement,
  isSortieRequirement,
} from '@/lib/ground-school/sortie-presence';
import { generatePBLV2Project } from '@/lib/pbl/v2/agents/planner';

import {
  StepRefusal,
  type OwnerStepContext,
  type StepLanguageModel,
  type VisionPromptImage,
} from './context';

/**
 * Aggregate budget for the WHOLE resolve-with-refill phase, reused from the
 * shared 15 s ingest-drain constant (the same constant the extraction cache's
 * probe phase reuses). Each probe is an unbounded server-side store round trip
 * (no statement timeout), so an all-fail phase must not churn every candidate
 * sequentially: when the budget expires the phase STOPS and generation
 * proceeds with whatever resolved so far (degrade, never fail).
 */
const VISION_RESOLUTION_BUDGET_MS = 15_000;

/**
 * Consecutive-failure fuse for the resolve-with-refill loop: after this many
 * unresolvable/errored candidates IN A ROW the store is evidently down, so
 * probing stops instead of churning the remaining candidates (one summary warn
 * names the fuse). A resolved candidate resets the streak.
 */
const MAX_CONSECUTIVE_UNRESOLVABLE_VISION_IMAGES = 3;

export interface SceneContentInput {
  outline: SceneOutline;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  agents?: AgentInfo[];
  languageDirective?: string;
  requirements?: UserRequirements;
  /** The learner's locale, when known. */
  targetLanguage?: string;
  /** The model of the outline type's scene-content stage. */
  model: StepLanguageModel;
}

export type SceneContentRefusal = 'generation-failed';

export type GeneratedSceneContent = NonNullable<Awaited<ReturnType<typeof generateContent>>>;

export interface SceneContentResult {
  content: GeneratedSceneContent;
  /** The outline as generated, after the fallbacks for what it leaves out. */
  effectiveOutline: SceneOutline;
}

export async function generateSceneContent(
  input: SceneContentInput,
  ctx: OwnerStepContext,
): Promise<SceneContentResult> {
  const { pdfImages, imageMapping, agents, languageDirective, requirements } = input;
  const {
    model: languageModel,
    modelInfo,
    modelString,
    thinkingConfig,
    serverManaged,
  } = input.model;
  const { log } = ctx;
  const outline: SceneOutline = { ...input.outline };

  // Detect vision capability
  const hasVision = !!modelInfo?.capabilities?.vision;

  // Images are resolved and prepared before the generator builds its prompt,
  // so its placeholders and attachments describe the same set. The
  // resolution below is a DEFENSIVE NO-OP for those concrete data URLs
  // (RFC #1153 part 2 B); it is kept so a package consumer that generates
  // without pre-resolving never sends an allocated asset id as an image.
  const aiCall = async (
    systemPrompt: string,
    userPrompt: string,
    images?: Array<{ id: string; src: string }>,
  ): Promise<string> => {
    const system = withGenerationSystemPrompt(systemPrompt, {
      questionBankTopics: DEFAULT_SORTIE_TOPICS,
    });
    if (images?.length && hasVision) {
      const resolvedImages = await ctx.resolveVisionImages(images);
      const result = await callLLM(
        {
          model: languageModel,
          // A run cancels the call when it loses its lease or its course.
          abortSignal: ctx.signal,
          system,
          messages: [
            {
              role: 'user' as const,
              content: buildVisionUserContent(userPrompt, resolvedImages),
            },
          ],
          maxOutputTokens: modelInfo?.outputWindow,
          maxRetries: 0,
        },
        'scene-content',
        undefined,
        thinkingConfig,
        { serverManaged },
      );
      return result.text;
    }
    const result = await callLLM(
      {
        model: languageModel,
        abortSignal: ctx.signal,
        system,
        prompt: userPrompt,
        maxOutputTokens: modelInfo?.outputWindow,
        maxRetries: 0,
      },
      'scene-content',
      undefined,
      thinkingConfig,
      { serverManaged },
    );
    return result.text;
  };

  // ── Apply fallbacks ──
  const vocationalActive = resolveVocationalActive(requirements);
  const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel, {
    allowProceduralSkill: vocationalActive,
  });

  // ── Filter images assigned to this outline ──
  let assignedImages: PdfImage[] | undefined;
  if (
    pdfImages &&
    pdfImages.length > 0 &&
    effectiveOutline.suggestedImageIds &&
    effectiveOutline.suggestedImageIds.length > 0
  ) {
    const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
    assignedImages = sortDocumentImagesForVision(
      pdfImages.filter((img) => suggestedIds.has(img.id)),
    );
  }

  // ── N3: resolve-then-slice the vision candidates BEFORE prompt assembly ──
  // The prompt text and the multimodal attachments must be built from the
  // SAME resolved set: an image the server cannot resolve (a reclaimed
  // asset, a store failure) is dropped from BOTH — its `[see attached]`
  // text mention and its attachment — instead of leaving a dangling promise
  // in the prompt. The candidates are computed in the generator's OWN order
  // (the shared `partitionImagesForVision` helper, so the step and the
  // generator cannot drift) and resolved IN ORDER with refill until the cap
  // is met or the candidates are exhausted: a drop admits the next image
  // WITH its resolution, so the generator's re-slice (same helper, same
  // cap) can never admit an image this step has not resolved (review P2).
  // Every id the resolution drops is STRIPPED from the `imageMapping` (and
  // `assignedImages`) passed onward, so a model-hallucinated reference to a
  // dropped id takes the existing clean "no mapping → remove element" path
  // in `resolveImageIds` instead of writing a dangling allocated id into
  // `src` (review P3). The resolved slice is passed to the generator so
  // `aiCall` does not re-resolve (its resolution is a defensive no-op).
  let visionImageMapping: ImageMapping | undefined = imageMapping;
  let resolvedVisionImages: VisionPromptImage[] | undefined;
  if (assignedImages && assignedImages.length > 0 && hasVision && imageMapping) {
    const { withSrc } = partitionImagesForVision(assignedImages, imageMapping, MAX_VISION_IMAGES);
    // Bound the resolve-with-refill loop (review P2, round 3): the store may
    // be down, and each probe is an unbounded server-side round trip, so an
    // all-fail phase must not churn every candidate (and emit a warn per
    // candidate) until the route's 300 s platform cap. Two stops, both
    // degrading to "whatever resolved so far" — never failing the step:
    // (a) an aggregate budget of resolver time across the phase (the shared 15 s ingest
    // constant, raced against each probe so even ONE hanging probe cannot
    // outlive it) and (b) a consecutive-failure fuse (3 unresolvable/errored
    // candidates in a row → stop). When a stop fires, every candidate that
    // did not resolve — unresolvable OR unprobed — is STRIPPED from the
    // mapping, so the generator can never hand an unresolved allocated id to
    // aiCall; ONE summary warn names the stop.
    // The budget meters resolver time only: image preparation (decode and
    // re-encode) runs outside it so slow transformations cannot starve probes.
    let resolutionMsRemaining = VISION_RESOLUTION_BUDGET_MS;
    const resolvedById = new Map<string, VisionPromptImage>();
    let consecutiveUnresolvable = 0;
    let stopReason: 'fuse' | 'budget' | null = null;
    for (const candidate of withSrc) {
      if (resolvedById.size >= MAX_VISION_IMAGES) break;
      if (consecutiveUnresolvable >= MAX_CONSECUTIVE_UNRESOLVABLE_VISION_IMAGES) {
        stopReason = 'fuse';
        break;
      }
      if (resolutionMsRemaining <= 0) {
        stopReason = 'budget';
        break;
      }
      let attempted: VisionPromptImage[] | '__vision-resolution-budget-expired__';
      let probeTimer: ReturnType<typeof setTimeout> | undefined;
      const probeStartedAt = Date.now();
      try {
        attempted = await Promise.race([
          ctx.resolveVisionImages([
            {
              id: candidate.id,
              src: imageMapping[candidate.id],
              ...(candidate.width !== undefined ? { width: candidate.width } : {}),
              ...(candidate.height !== undefined ? { height: candidate.height } : {}),
            },
          ]),
          new Promise<'__vision-resolution-budget-expired__'>((resolve) => {
            probeTimer = setTimeout(
              () => resolve('__vision-resolution-budget-expired__'),
              resolutionMsRemaining,
            );
          }),
        ]);
      } catch (error) {
        // A throwing probe counts as an unresolvable candidate (an errored
        // store must degrade, never fail the step).
        log.error(
          `Vision image resolution probe for "${candidate.id}" failed; treating it as unresolvable:`,
          error,
        );
        attempted = [];
      } finally {
        if (probeTimer !== undefined) clearTimeout(probeTimer);
        resolutionMsRemaining -= Date.now() - probeStartedAt;
      }
      if (attempted === '__vision-resolution-budget-expired__') {
        stopReason = 'budget';
        break;
      }
      if (attempted.length !== 1) {
        consecutiveUnresolvable += 1;
        continue;
      }
      // The store answered, so the fuse resets even when the image itself is
      // unusable; a dropped image is skipped and the next candidate refills.
      consecutiveUnresolvable = 0;
      const [prepared] = await prepareVisionImages(attempted, log);
      if (prepared) resolvedById.set(prepared.id, prepared);
    }
    resolvedVisionImages = [...resolvedById.values()];
    // Every candidate that did not resolve — an unresolvable probe, OR an
    // unprobed one when the fuse/budget stopped the phase — is stripped from
    // the mapping and the assigned set, so the generator's re-slice (same
    // helper, same cap) can never admit an image this step has not resolved
    // (possibly all of them = text-only generation).
    const droppedIds = new Set(
      withSrc
        .filter((candidate) => !resolvedById.has(candidate.id))
        .map((candidate) => candidate.id),
    );
    if (droppedIds.size > 0) {
      assignedImages = assignedImages.filter((img) => !droppedIds.has(img.id));
      visionImageMapping = Object.fromEntries(
        Object.entries(imageMapping).filter(([id]) => !droppedIds.has(id)),
      );
    }
    if (stopReason !== null) {
      log.warn(
        `Stopped probing vision image candidates early: the ${
          stopReason === 'fuse'
            ? `consecutive-failure fuse (${MAX_CONSECUTIVE_UNRESOLVABLE_VISION_IMAGES} unresolvable in a row)`
            : `${VISION_RESOLUTION_BUDGET_MS}ms aggregate resolution budget`
        } fired; proceeding to generation with ${resolvedById.size} resolved image(s) and the rest dropped to text-only (degrade, not fail).`,
      );
    }
  }

  // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
  // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
  // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
  const generatedMediaMapping: ImageMapping = {};

  // ── Generate content ──
  log.info(
    `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
  );

  // RSAF Commands sortie: seed the terminal quiz from the question bank
  // (exact wording) instead of LLM-invented stems. Distribution follows
  // assessment level (L1 R/U, L2 apply/analyze, L3 evaluate/create).
  if (
    effectiveOutline.type === 'quiz' &&
    requirements?.requirement &&
    isSortieRequirement(requirements.requirement)
  ) {
    const level = assessmentLevelFromRequirement(requirements.requirement);
    const seed = `${effectiveOutline.id}:${effectiveOutline.order}:${level}:${requirements.requirement.length}`;
    const questions = sampleQuizQuestionsFromBank({
      topics: DEFAULT_SORTIE_TOPICS,
      count: effectiveOutline.quizConfig?.questionCount ?? SORTIE_QUIZ_QUESTION_COUNT,
      seed,
      bloomsDistribution: quizDistributionForLevel(level),
      allowOverflow: false,
    });
    if (questions.length === 0) {
      throw new StepRefusal<SceneContentRefusal>(
        'generation-failed',
        `Question bank has no ${level} Bloom items for quiz: ${effectiveOutline.title}`,
      );
    }
    if (questions.length < (effectiveOutline.quizConfig?.questionCount ?? SORTIE_QUIZ_QUESTION_COUNT)) {
      log.warn(
        `Sortie ${level} quiz undersized: ${questions.length}/${effectiveOutline.quizConfig?.questionCount ?? SORTIE_QUIZ_QUESTION_COUNT} bank items available for required Blooms`,
      );
    }
    log.info(
      `Seeded ${level} quiz from question bank: ${questions.length} items for "${effectiveOutline.title}"`,
    );
    return {
      content: { questions },
      effectiveOutline: {
        ...effectiveOutline,
        quizConfig: {
          questionCount: questions.length,
          difficulty: effectiveOutline.quizConfig?.difficulty ?? 'medium',
          questionTypes: effectiveOutline.quizConfig?.questionTypes ?? ['single', 'multiple'],
        },
      },
    };
  }

  // L2/L3 assessor probe pack — template-filled, not LLM-invented.
  if (
    effectiveOutline.type === 'probe_pack' &&
    requirements?.requirement &&
    isSortieRequirement(requirements.requirement)
  ) {
    const level = assessmentLevelFromRequirement(requirements.requirement);
    if (!hasProbePack(level)) {
      throw new StepRefusal<SceneContentRefusal>(
        'generation-failed',
        `Probe pack is only valid for L2/L3 (got ${level})`,
      );
    }
    const packLevel =
      effectiveOutline.probePackConfig?.assessmentLevel &&
      hasProbePack(effectiveOutline.probePackConfig.assessmentLevel)
        ? effectiveOutline.probePackConfig.assessmentLevel
        : level;
    const content = buildProbePackContent(packLevel);
    log.info(`Built ${packLevel} assessor probe pack for "${effectiveOutline.title}"`);
    return {
      content,
      effectiveOutline: {
        ...effectiveOutline,
        type: 'probe_pack',
        probePackConfig: { assessmentLevel: packLevel },
      },
    };
  }

  const content = await generateContent(effectiveOutline, aiCall, {
    assignedImages,
    imageMapping: visionImageMapping,
    visionEnabled: hasVision,
    generatedMediaMapping,
    resolvedVisionImages,
    agents,
    languageDirective,
    targetLanguage: input.targetLanguage || undefined,
    userRequirements: requirements,
    allowProceduralSkill: vocationalActive,
    ...(effectiveOutline.type === 'pbl'
      ? {
          pblLoopFallback: (plannerInput) =>
            generatePBLV2Project(
              plannerInput,
              languageModel,
              callLLM,
              { logger: log },
              thinkingConfig,
            ),
        }
      : {}),
  });

  if (!content) {
    log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

    throw new StepRefusal<SceneContentRefusal>(
      'generation-failed',
      `Failed to generate content: ${effectiveOutline.title}`,
    );
  }

  // Capture LLM-invented quiz stems (non-sortie or fallback path) as Draft
  // bank rows for Sheets re-import.
  if (
    effectiveOutline.type === 'quiz' &&
    content &&
    'questions' in content &&
    Array.isArray(content.questions)
  ) {
    try {
      const added = appendDraftQuestions(
        content.questions.map((q) => ({
          question: q.question,
          fieldType:
            q.type === 'multiple'
              ? 'Checkbox'
              : q.type === 'short_answer'
                ? 'Long Answer'
                : 'Radio',
          options: q.options?.map((o) => o.label) ?? [],
          correctAnswer:
            q.options && q.answer
              ? q.answer
                  .map((value) => q.options?.find((o) => o.value === value)?.label ?? value)
                  .join('; ')
              : '',
          explanation: q.analysis ?? '',
          topic: DEFAULT_SORTIE_TOPICS[0],
          source: 'generation',
        })),
      );
      if (added.length > 0) {
        log.info(`Recorded ${added.length} Draft question(s) from generated quiz`);
      }
    } catch (error) {
      log.warn('Failed to append Draft quiz questions to the bank', error);
    }
  }

  log.info(`Content generated successfully: "${effectiveOutline.title}"`);
  return { content, effectiveOutline };
}
