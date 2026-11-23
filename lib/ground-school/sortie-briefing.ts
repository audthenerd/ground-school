/**
 * Fixed sortie briefing for Ground School home.
 *
 * Learners no longer type a topic: Start Mission always starts from
 * a level-scoped SORTIE_REQUIREMENT, and the card shows SORTIE_INSTRUCTIONS
 * with a typewriter.
 *
 * The generation pipeline also attaches RSAF Commands question-bank objectives
 * (see question-bank.ts) so slides teach facts needed for those items.
 */
import {
  type AssessmentLevel,
  assessmentLevelHelperText,
  hasProbePack,
} from '@/lib/ground-school/assessment-level';

export { SORTIE_INSTRUCTIONS } from '@/lib/ground-school/sortie-instructions';

/** Stable marker embedded in every RSAF Commands sortie requirement. */
export const SORTIE_REQUIREMENT_MARKER = 'THIS SORTIE — RSAF Commands only';

/** Embedded so generation / presence can recover the assessment level. */
export const SORTIE_ASSESSMENT_LEVEL_PREFIX = 'ASSESSMENT_LEVEL:';

function bloomSection(level: AssessmentLevel): string {
  switch (level) {
    case 'L1':
      return `LEVEL — Immersed (L1) · Bloom's Remember + Understand
1. Remember   — command names, roles, groups and definitions, stated plainly.
2. Understand — why each command exists and how it differs from its neighbours.
Stop at Understand for lecture slides. Do not generate Apply, Analyse,
Evaluate, or Create lecture scenes for this L1 sortie.
Weight roughly 40% Remember, 60% Understand on slides.`;
    case 'L2':
      return `LEVEL — Capable prep (L2) · Bloom's Apply + Analyse
1. Remember/Understand may appear briefly only to unlock Apply.
2. Apply      — a concrete situation where the learner matches the right command
                or group to a stated need.
3. Analyse    — two things that look alike (e.g. ADOC vs APGC); the learner
                distinguishes them and states the cost of confusing them.
Stop at Analyse. Do not generate Evaluate or Create scenes.
Centre the lesson on Apply/Analyse. Weight roughly 20% Remember/Understand,
40% Apply, 40% Analyse.`;
    case 'L3':
      return `LEVEL — Lead-Capable prep (L3) · Bloom's Evaluate + Create
1. Lower levels only as brief scaffolding.
2. Evaluate — justify a stand or decision about ops flow / doctrine.
3. Create   — design an inject, approach, or adoption path.
Evaluate and Create scenes are required for this L3 sortie.
Weight roughly 20% Apply/Analyse scaffolding, 40% Evaluate, 40% Create.`;
  }
}

function scenesSection(level: AssessmentLevel): string {
  if (!hasProbePack(level)) {
    return `SCENES — fixed shape (exactly 11 scenes; do not add or omit)
1–9. Exactly nine type "slide" lecture scenes.
     Scene 1: why command boundaries matter to someone building software for
     this customer — one concrete decision they would make better (short).
     Scenes 2–8: dense Remember/Understand covering every bank item in this
     sortie (name which IDs each slide unlocks).
     Scene 9: three things to retain, phrased as the learner would use them
     on the quiz.
10. Exactly one type "interactive" page (diagram or simulation) as a light
    concept check — keep Apply/Analyse light; L1 certification is the quiz.
11. Exactly one type "quiz" scene last, with quizConfig.questionCount: 20.
Never put AI grounding rules, Bloom weights, or agent-role policy on slides.
Do not insert mid-lesson quizzes. Do not add PBL or probe_pack scenes.`;
  }

  return `SCENES — fixed shape (exactly 11 scenes; do not add or omit)
1–8. Exactly eight type "slide" lecture scenes at this level's Bloom ceiling.
9. Exactly one type "interactive" scenario page for Apply/Analyse practice.
10. Exactly one type "quiz" practice scene, quizConfig.questionCount: 20.
    Title it with "Practice" — it does NOT certify Capable / Lead-Capable.
11. Exactly one type "probe_pack" assessor instrument last (E, M, I probes).
    Banner must state it does not award Capable / Lead-Capable.
Never put AI grounding rules, Bloom weights, or agent-role policy on slides.
Do not insert mid-lesson quizzes. Do not add PBL scenes.`;
}

function quizSection(level: AssessmentLevel): string {
  if (!hasProbePack(level)) {
    return `QUIZ SCENES
The terminal scene is an actual quiz (assessment), not a practice quiz. Title
it "RSAF Commands Quiz" (never "practice"). Its twenty questions are taken
from the RSAF Commands question bank (exact wording); do not invent quiz
stems. Sample only Remember/Understand bank items.
quizConfig must be
{ "questionCount": 20, "difficulty": "medium", "questionTypes": ["single", "multiple"] }.`;
  }

  return `QUIZ + PROBE PACK
Scene 10 is a PRACTICE quiz for interview prep — never claim it certifies
Capable or Lead-Capable. Title it "RSAF Commands Practice Quiz". Its twenty
questions are taken from the RSAF Commands question bank (exact wording);
do not invent quiz stems. Sample only ${level === 'L2' ? 'Apply/Analyse' : 'Evaluate/Create'} bank items.
quizConfig must be
{ "questionCount": 20, "difficulty": "medium", "questionTypes": ["single", "multiple"] }.
Scene 11 is type "probe_pack" with probePackConfig.assessmentLevel: "${level}".
Do not invent unit facts in probe stems beyond classroom grounding.`;
}

/**
 * Build the generation requirement for an RSAF Commands sortie at `level`.
 */
export function buildSortieRequirement(level: AssessmentLevel = 'L1'): string {
  return `ROLE
You are generating an operational-immersion lesson for software engineers who
build systems for the RSAF. They are technically strong and operationally new.
Assume no military background and no tolerance for being talked down to.

${SORTIE_REQUIREMENT_MARKER}
${SORTIE_ASSESSMENT_LEVEL_PREFIX} ${level}
${assessmentLevelHelperText(level)}
Teach the RSAF Commands question-bank learning objectives attached to the system
prompt (the six commands, their roles, internal groups, and distinctions such as
ADOC vs APGC). Every slide must unlock specific question IDs from that block.
Do not pad with Platforms, Recognition, or other out-of-scope bank topics.

GROUNDING — this rule overrides every other instruction
Teach only what is present in the question-bank Teach / Target answer / Source
fields for this sortie (and any other source material supplied with this request).
Do not supplement from your own knowledge of military aviation, the RSAF, or any
armed force. If the bank is thin on a point, teach it thinly or leave it out.
Never invent: unit names, squadron numbers, platform or system specifications,
procedures, timings, readiness states, order of battle, or any operational
detail. If asked to cover something the bank does not support, produce a scene
that says so and names what source would be needed.

${bloomSection(level)}

${scenesSection(level)}

${quizSection(level)}

VOCABULARY
Use the bank/source terms exactly. Expand every acronym on first use. Do not
introduce an acronym the source does not contain. Follow Singapore government
spellings — "Defence" not "Defense", "Air Defence and Operations Command" not
"Air Defence Operations Centre".

TONE
Plain and specific. No "exciting world of" openings. This is a professional being
brought up to speed on a domain, not a student being entertained.`;
}

/**
 * Default L1 generation requirement (admin curriculum / Start Mission).
 * Prefer {@link buildSortieRequirement} when the level is known.
 */
export const SORTIE_REQUIREMENT = buildSortieRequirement('L1');
