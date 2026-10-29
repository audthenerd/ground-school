/**
 * Fixed sortie briefing for Ground School home.
 *
 * Learners no longer type a topic: Enter Classroom always starts from
 * SORTIE_REQUIREMENT, and the card shows SORTIE_INSTRUCTIONS with a typewriter.
 *
 * The generation pipeline also attaches RSAF Commands question-bank objectives
 * (see question-bank.ts) so slides teach facts needed for those items.
 */

/** Learner-facing copy typed onto the mission briefing card. */
export const SORTIE_INSTRUCTIONS = [
  'You are about to start a mini classroom on RSAF Commands.',
  '',
  'Follow the lesson with your instructors. It prepares you for a practice quiz.',
  '',
  'When the classroom ends, you will attempt that practice quiz.',
].join('\n');

/**
 * Generation requirement sent with every Enter Classroom click.
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

SCENES
Open with one short slide on why command boundaries matter to someone building
software for this customer — one concrete decision they would make better.
Then dense Remember/Understand slides that cover every bank item in this sortie
(name which IDs each slide unlocks). Scenario/discussion for Apply and Analyse.
A simulation only where a relationship is genuinely structural and a diagram
would not do.
Never put AI grounding rules, Bloom weights, or agent-role policy on slides.
Close with three things to retain, phrased as the learner would use them on the quiz.

QUIZ SCENES
Generate one practice quiz after the teaching slides, testing only facts taught
earlier (same bank IDs or close paraphrases). Label it practice. It is not
assessment. Scored assessment comes from the separately reviewed question bank
and is never generated here.

VOCABULARY
Use the bank/source terms exactly. Expand every acronym on first use. Do not
introduce an acronym the source does not contain. Follow Singapore government
spellings — "Defence" not "Defense", "Air Defence and Operations Command" not
"Air Defence Operations Centre".

TONE
Plain and specific. No "exciting world of" openings. This is a professional being
brought up to speed on a domain, not a student being entertained.`;
