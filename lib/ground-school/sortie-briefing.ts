/**
 * Fixed sortie briefing for Ground School home.
 *
 * Learners no longer type a topic: Start Mission always starts from
 * SORTIE_REQUIREMENT, and the card shows SORTIE_INSTRUCTIONS with a typewriter.
 *
 * The generation pipeline also attaches RSAF Commands question-bank objectives
 * (see question-bank.ts) so slides teach facts needed for those items.
 */

/** Learner-facing copy typed onto the mission briefing card. */
export const SORTIE_INSTRUCTIONS = [
  'You are about to start a mini classroom on RSAF Commands.',
  '',
  'Follow the lesson with your instructors. It prepares you for a quiz.',
  '',
  'When the classroom ends, you will attempt that quiz.',
].join('\n');

/**
 * Generation requirement used when an admin generates curriculum candidates.
 * Kept verbatim — do not paraphrase when editing.
 */
export const SORTIE_REQUIREMENT = `ROLE
You are generating an operational-immersion lesson for software engineers who
build systems for the RSAF. They are technically strong and operationally new.
Assume no military background and no tolerance for being talked down to.

THIS SORTIE — RSAF Commands only
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

LEVEL — structure every lesson on Bloom's taxonomy, lowest to highest
1. Remember   — command names, roles, groups and definitions, stated plainly.
2. Understand — why each command exists and how it differs from its neighbours.
3. Apply      — a concrete situation where the learner matches the right command
                or group to a stated need.
4. Analyse    — two things that look alike (e.g. ADOC vs APGC); the learner
                distinguishes them and states the cost of confusing them.
Stop at Analyse. Do not generate Evaluate or Create scenes.
Weight roughly 20% Remember, 30% Understand, 30% Apply, 20% Analyse.

SCENES — fixed shape (exactly 11 scenes; do not add or omit)
1–9. Exactly nine type "slide" lecture scenes.
     Scene 1: why command boundaries matter to someone building software for
     this customer — one concrete decision they would make better (short).
     Scenes 2–8: dense Remember/Understand covering every bank item in this
     sortie (name which IDs each slide unlocks).
     Scene 9: three things to retain, phrased as the learner would use them
     on the quiz.
10. Exactly one type "interactive" page for Apply/Analyse (diagram or
    simulation). The Trainee matches a need to the right command/group or
    distinguishes look-alikes (e.g. ADOC vs APGC).
11. Exactly one type "quiz" scene last, with quizConfig.questionCount: 20.
Never put AI grounding rules, Bloom weights, or agent-role policy on slides.
Do not insert mid-lesson quizzes. Do not add PBL scenes.

QUIZ SCENES
The terminal scene is an actual quiz (assessment), not a practice quiz. Title
it "RSAF Commands Quiz" (never "practice"). Its twenty questions are taken
from the RSAF Commands question bank (exact wording); do not invent quiz
stems. quizConfig must be
{ "questionCount": 20, "difficulty": "medium", "questionTypes": ["single", "multiple"] }.

VOCABULARY
Use the bank/source terms exactly. Expand every acronym on first use. Do not
introduce an acronym the source does not contain. Follow Singapore government
spellings — "Defence" not "Defense", "Air Defence and Operations Command" not
"Air Defence Operations Centre".

TONE
Plain and specific. No "exciting world of" openings. This is a professional being
brought up to speed on a domain, not a student being entertained.`;
