# Ground School — Product Requirements

Oct 27, 2026 · @Audrey Kow

## Summary

Ground School is an internal web application that delivers scored, named assessments of operational knowledge to RAP developers, and tracks results over time.

It serves the RAiD Operational Quotient (OQ) Programme, which aims to raise operational depth among developers but currently has no way to measure whether it is working.

The content already exists: a question bank of 110 items covering RSAF commands, platforms and air defence, each answer sourced to an official RSAF page. What is missing is delivery, scoring and analysis.

v1 does four things: serve an exam to an authenticated candidate, record what they saw and answered, score it, and report. Everything else is deferred.

"Ground School" is a working name and not settled. Alternatives under consideration are Checkride, Currency and OQ Range.

## Problem and context

RAP developers build software for an operational customer, but operational depth across the team is uneven and unmeasured. The OQ Programme exists to close that gap; without assessment there is no way to tell which gaps are closing, which are not, and who needs what.

**What exists today.** A question bank of 110 items in Google Sheets, built over October 2026:

| Set | IDs | Coverage | Source |
| --- | --- | --- | --- |
| Commands (initial) | Q001–Q010 | The six RSAF commands | [rsaf.gov.sg/commands](https://www.rsaf.gov.sg/rsaf-forces/commands/) |
| Platforms and air defence | Q011–Q040 | Aircraft, UAVs, GBAD, radar | [aircraft](https://www.rsaf.gov.sg/rsaf-forces/aircraft/), [weapon systems](https://www.rsaf.gov.sg/rsaf-forces/weapon-systems/) |
| ADOC / APGC distinction | Q041–Q060 | Command boundaries, platforms, air defence | Mixed |
| Commands (detailed) | Q061–Q110 | Five commands, ten questions each | Per-command pages |

Every row carries a 15-column schema including ID, field type, options, correct answer, explanation, topic, subtopic, difficulty, status, source and last-verified date. Answers were taken from official pages rather than written from memory, because an error seeded into a bank propagates into every exam built from it.

**What is missing.** There is no way to deliver the bank as a scored exam, no record of who sat what and scored what, and no analysis showing which questions discriminate between people who know the material and people who do not.

**Known content gaps.** The Air Force Training Command has no detailed question set. Eight long-answer items have no marking rubric. A handful of options in Q041–Q043 were reconstructed from screenshots and need verification against the originals.

## Goals and non-goals

**Goals for v1**

1. Deliver a scored exam, drawn from the existing bank, to an authenticated named candidate.
2. Produce a record of each attempt that can be reconstructed months later — what was shown, what was answered, how it was scored.
3. Report each candidate's score to them without leaking the answer key to candidates who have not yet sat.
4. Surface which questions and which topics are weak, and which questions are broken.

**Non-goals**

Stated explicitly because each is a plausible next step that would change the build:

- **Not AI-generated content.** The bank is hand-sourced; generation reintroduces the error risk the sourcing removed.
- **Not AI-graded.** Scored, disputable output needs deterministic marking.
- **Not a learning management system.** No courseware, enrolment or certification tracking.
- **Not proctored.** No lockdown browser, webcam or screen monitoring.
- **No in-app question authoring.** Google Sheets stays the authoring surface so non-developer contributors keep working in a tool they already use.
- **Not a formal training record.** This informs the OQ Programme; it does not feed SAF training or competency systems.

## Users and roles

| Role | Who | What they do in the system |
| --- | --- | --- |
| Candidate | RAP and wider RAiD staff | Sit an exam, see their own score and their own attempt history. Cannot see anyone else's. |
| Author | Subject matter contributors | Propose and draft questions in Google Sheets. No system access needed. |
| Reviewer | Nominated SME | Verify a question against its source and move it to Approved. Only Approved questions can be served. |
| Administrator | Programme owner | Define exams, open and close windows, release results, view individual results, run item analysis. |

The Author and Reviewer roles live entirely in Google Sheets in v1. Only Candidate and Administrator need application accounts.

**Who may set a question to Approved** must be decided before launch. If everyone can, the status column stops meaning anything within a month.

## Scope

**In scope for v1**

- Authenticated sign-in using existing organisational identity
- Seed pipeline: approved questions from Sheets into the application database
- Exam definition: a named set of questions, points, time limit, pass mark, open and close window
- Candidate sitting flow with a visible timer and save-as-you-go
- Snapshot of every question as served into the attempt record
- Automatic scoring of Radio, Checkbox, Yes/No and Dropdown items
- Email notification of total score, linking to a results page
- Results page with per-question detail gated until release
- Administrator view: attempts, scores, per-question facility and discrimination

**Deferred**

| Deferred item | Revisit when |
| --- | --- |
| In-app question authoring | Sheets becomes the bottleneck, not before |
| Long-answer marking workflow | A rubric exists and someone owns marking |
| Question pooling and per-candidate randomisation | A second cohort sits the same exam |
| Cohort comparison and trend charts | Enough attempts exist for the numbers to mean anything |
| Learning content and practice mode | Assessment is working and adopted |
| Integration with the Ground School classroom flow | The exam side is stable |

## Content model and authoring

**Google Sheets remains the source of truth.** Questions are drafted and reviewed there, then seeded into the application. Non-developer contributors keep a tool they already know, and the application never needs an authoring UI.

**Schema.** Fifteen columns: ID, Question, Field Type, Options, Correct Answer, Explanation, Topic, Subtopic, Difficulty, Required, Status, Source, Last Verified, Used In, Notes. Options are pipe-separated; multiple correct answers are semicolon-separated.

**Status lifecycle.** Only `Approved` questions are eligible to be served.

| Status | Meaning |
| --- | --- |
| Draft | Written, not yet checked by anyone else |
| In review | With a reviewer now |
| Approved | Cleared for use in a live exam |
| Needs update | Was approved, but the underlying fact has changed |
| Retired | No longer used, kept for history |

`Needs update` matters more than it looks. Organisational structures change, and without it people either leave a stale question Approved or retire a good question that only needed a tweak.

**Versioning rule: never edit a question that has been served.** Any content change to a served question creates a new version with a new version number against the same question ID. This is what lets a past attempt stay explainable after the bank moves on.

**Field types in the bank.** Radio and Dropdown (one correct), Checkbox (one or more), Yes/No, and Long Answer. Only the first four are auto-scorable; Long Answer is out of scope for scored exams in v1.

**Seed pipeline.** A script reads the sheet, validates, and upserts. Validation must reject: a correct answer not present in its options, a duplicate ID, a blank source, and a status change on a question that has already been served without a version bump.

## Exam lifecycle

&#91;embedded content: exam lifecycle · 9 steps\]

The snapshot at attempt creation is what makes every later step defensible: scoring reads the snapshot, not the bank, so editing a question afterwards cannot change what a past candidate was marked against.

## Scoring and grading rules

Every rule below must be decided before the first sitting, because each one changes the schema or the scoring code. Proposed defaults are starting positions, not recommendations to adopt without discussion.

| Rule | Options | Proposed default |
| --- | --- | --- |
| Multi-select credit | All-or-nothing; proportional; proportional with penalty for wrong ticks | Proportional, floored at zero |
| Negative marking | None; penalty for wrong answers | None — it mainly measures risk appetite |
| Retakes | None; fixed number; unlimited within window | One retake, best attempt counts |
| Which attempt counts | First; best; latest | Best |
| Pass mark | Overall percentage; per-topic threshold; both | Overall 70%, reviewed after the first cohort |
| Unanswered items | Zero; excluded from denominator | Zero |
| Long Answer | Excluded; human-marked; AI-assisted with human confirmation | Excluded from scored exams in v1 |

**Scores are derived, not authoritative.** Compute from the attempt's item records; cache `score_raw`, `score_max`, `passed` and `graded_at` on the attempt for speed. The items remain the source of truth.

**Grading version.** Store a `grading_version` on every attempt. When a rule changes — and the multi-select rule will change — you need to know which attempts were scored under which rule, and be able to regrade without destroying the original result.

**Regrading.** A wrong answer key will be found eventually. The system must support correcting a question, regrading affected attempts, and keeping both the original and corrected score with a reason. Candidates whose result changed must be told.

## Assessment integrity

**Assume open book.** There is no proctoring and there will not be. Designing as though candidates cannot look things up produces a system that is both annoying and ineffective. Design instead so that looking things up costs time.

**Time limit.** Set tight enough that searching for each answer is expensive but generous enough that a prepared candidate is not rushed. Start at roughly 60 to 90 seconds per single-choice item and tune after the first cohort using recorded completion times.

**Question pooling.** Deferred to v2, but the schema must not preclude it. With 110 questions across clean subtopics, an exam can be defined as "four from Air Combat Command, four from ADOC, four from Platforms" and each candidate gets a different paper drawn from those pools. This is worth more than any anti-cheating control, and the bank is already structured for it.

**Option order.** Randomise per attempt. Cheap to do, removes positional answer sharing, and the snapshot records the order as shown so the record stays accurate.

**Answer key leakage is the real risk**, not cheating during the sitting. Three channels leak it:

1. Explanations shown immediately on submit
2. Per-question detail in the notification email
3. The results page while the window is still open

All three are closed by the same rule: per-question detail and explanations are released only after the exam window closes, or after the candidate has used their final attempt.

## Results, notification and dashboard

### Notification

**The email must never block submission.** Write the attempt and its items, commit, then enqueue the notification. Losing an exam attempt because the mail relay timed out is the worst failure this system can produce.

**Exactly once.** Store `notified_at` on the attempt and key the job on the attempt ID. A duplicate email carrying a different number is worse than no email.

**Contents.** Total score, pass or fail, and a link to the results page. No per-question breakdown — that email gets forwarded. One line stating what the score is used for and who can see it; people read these with more anxiety than expected.

**The email is a notification, not the record.** The results page is authoritative. Scores sitting in inboxes are hard to retract when a bad answer key is found, and one will be.

### Results page

Shows the candidate their total, pass or fail, and their own attempt history. Per-question detail and explanations appear only after release. No candidate ever sees another candidate's result.

### Item analysis

Two numbers per question, computed from attempt items:

| Metric | Definition | Review threshold |
| --- | --- | --- |
| Facility | Percent of candidates answering correctly | Below 0.3 or above 0.9 |
| Discrimination | Percent correct among the top third of candidates by total score, minus the same for the bottom third | Below 0.2 |

**Negative discrimination is the single most valuable signal here.** If strong candidates get an item wrong more often than weak ones, the answer key is almost certainly wrong rather than the candidates. Given that parts of this bank were assembled from reconstructed screenshots, this is how the errors that survived review will be found.

Administrators also need: attempts and scores by person, mean score by topic and subtopic, and completion time distribution for tuning the time limit.

## Data model

&#91;embedded content: core tables · 5 entities\]

The dashed link is the one that matters. `attempt_item` does not hold a foreign key to `question`; it holds a copy of the question as rendered, taken when the attempt was created. Everything else is an ordinary relationship.

Without that copy, editing a question orphans the meaning of every past attempt that used it, and a candidate asking why they were marked wrong cannot be answered. Storage is cheap; an unexplainable score is not.

`question` carries a version number alongside its ID. A content change to a served question creates a new version rather than editing in place, so the bank can move forward without rewriting history.

## Governance, privacy and retention

This system holds named, individually scored assessment data about colleagues' competence. That is personnel-adjacent data, in a different category from an anonymous pulse survey, and the governance questions are not optional.

**Three things must be settled in writing before the first candidate sits.**

| Question | Why it cannot wait |
| --- | --- |
| What is the score used for? | If results could ever reach a supervisor, a performance conversation or a posting decision, candidates must be told before they answer. Finding out afterwards ends participation permanently. |
| Who can see individual rows? | Default: the programme owner sees individuals; everyone else sees aggregates only. Anything wider needs a named reason. |
| How long is individual data kept? | "Indefinitely" is not an answer. Propose 12 months at individual level, with aggregates retained longer. |

**Approval.** A short conversation with whoever owns data governance in RAiD before launch, not after the first cohort. Cheap now, expensive later.

**Consent and framing.** Candidates see the purpose statement before starting, not buried in a policy page. The statement covers what is collected, who sees it, how long it is kept and what it is used for.

**Behavioural effect.** People answer differently when named and scored. Expect look-ups, skipped items, and low scorers quietly dropping out — which biases results toward people who already know the material. If participation falls after the first round, the framing did not land; that is a signal to act on, not noise.

**A lower-risk alternative worth considering:** collect named, report aggregate to the organisation, and give each individual their own history. This preserves the longitudinal analysis, avoids most of the surveillance feeling, and is a substantially easier approval.

## Technical approach

**Stack.** TypeScript, Next.js and React, with PostgreSQL. This matches Ground School's stack, which keeps the reuse option open, and is familiar ground for RAP.

### Reusing Ground School

[Ground School](https://github.com/THU-MAIC/OpenMAIC) is an MIT-licensed platform that turns a topic or document into an AI-generated interactive classroom. Quizzes are one scene type within a generated lesson, graded by AI.

Only one part of it is wanted here: the **candidate-facing quiz renderer**. The generation pipeline and the AI grading are explicitly not used, for the reasons in Non-goals.

**The contract that makes this safe: the renderer is dumb.** The backend hands it a fully-formed payload — questions already selected, ordered and snapshotted — and receives an answer set back. The renderer never queries the question bank, never knows a bank exists, and never decides what is correct. Pooling, randomisation, scoring and audit all stay behind that line.

Drawing that boundary first makes the lifted components swappable. If the quiz scene turns out to be coupled to Ground School's session or agent orchestration, the renderer gets rebuilt in a day and nothing else changes.

**Spike before committing:** clone the repo, locate the quiz scene component, and count how many imports deep it goes before reaching LangGraph or the lesson model. Shallow, lift it. Deep, take the design and rebuild — a card with a question, options, points and an explanation is not hard UI.

### Licensing

MIT permits copying provided the copyright notice and licence text travel with whatever is taken. Maintain a `THIRD_PARTY` or `NOTICE` file recording what was lifted and from which commit. Check transitive dependencies of any copied component — the repo bundles at least one LGPL-3.0-or-later package, which surfaces awkwardly if found late in a review.

### Hosting

Hosting is an open question and it constrains two things: which mail relay is available for notifications, and whether any external API may be called at all. Settle this early — it may collapse several other options on its own.

## Authentication and identity

Sign-in has to answer one question: **which person on the roster is this?** Both candidate options answer a question well, but not the same one.

|  | Google Workspace | sgID |
| --- | --- | --- |
| What it verifies | Membership of an organisational email domain | That the user is a specific Singapore resident, via Singpass and MyInfo |
| Maps to the roster | Directly, if the roster is keyed on work email | Not directly — needs a mapping from a personal identifier to the roster |
| Candidate needs | Their existing work account | A Singpass account and the Singpass mobile app |
| Personal data brought into scope | Work email | Government-verified personal attributes |

**Recommendation: Google Workspace alone for v1**, with the hosted-domain parameter pinned to the organisation's domain so personal accounts cannot sign in. It answers the roster question directly, adds nothing beyond a work email, and asks nothing of the candidate they do not already have. This assumes the unit is on Google Workspace; confirm before committing.

sgID is the stronger identity proof and the wrong proof for this problem. Establishing that a candidate is a particular Singapore resident does not establish that they are on the roster — a mapping table is still needed, which means holding a government-verified personal identifier for every colleague in order to run a knowledge quiz. That widens the data scope and the governance conversation for no gain in what the exam needs to know.

**When sgID becomes the right answer:** if the audience ever extends past a single email domain — NSmen, other agencies, contractors — where no shared directory exists. Design so it can be added; do not add it now.

### Design decisions independent of provider

**Never key records on the provider's identifier.** Keep an internal `candidate` record with its own stable ID and link the external subject to it. Attempts reference the internal ID. This is what allows changing provider, adding a second one, or surviving an email change without orphaning attempt history.

**Supporting both providers costs account linking.** Two sign-in routes must resolve to one candidate, or the same person sits as two people and their history splits. If "and/or" is really the requirement, the linking rule is a v1 decision, not a later one.

**Session lifetime must exceed the exam time limit** with margin. A session expiring mid-attempt is indistinguishable, from the candidate's side, from losing their work.

Confirm the exact available fields, eligibility and cost against the [sgID developer FAQ](https://docs.id.gov.sg/faq-developers) and the [sgID product page](https://products.open.gov.sg/sgid) before committing either way.

## Open decisions

| Decision | Why it matters | Needed by |
| --- | --- | --- |
| What the score is used for, and who sees it | Changes consent, framing and approval. Cannot be retrofitted after people have sat. | Before first sitting |
| Hosting environment | Constrains mail relay, external API access and the whole deployment story | Before build starts |
| Identity source | Google Workspace, sgID, or both — see Authentication and identity. Supporting both adds account linking to v1 | Before build starts |
| Multi-select credit rule | Changes scoring code and `grading_version` handling | Before first sitting |
| Retakes and which attempt counts | Changes the data model and the email | Before first sitting |
| Pass mark | Sets expectations; hard to raise after a cohort has passed under a lower one | Before first sitting |
| Who may approve a question | Without it, the Status column loses meaning quickly | Before seeding |
| Product name | Repo, hostname and bookmarks all depend on it; check for collision with existing SAF or RSAF system names | Before repo creation |
| Air Force Training Command questions | The bank covers five of six commands | Before an exam claiming full coverage |
| Long-answer rubrics | Eight items currently unusable in a scored exam | Only if long answers are brought into scope |
| Verification of Q041–Q043 options | Reconstructed from screenshots, not yet confirmed against source | Before those items are served |

## Phasing and success measures

No dates are set. Phases are sequential, each gated on the one before.

**Phase 0 — Decisions and content.** Settle the governance questions, hosting and the scoring rules. Verify Q041–Q043 against source. Decide whether AFTC questions are needed for the first exam. No code.

**Phase 1 — Thin vertical slice.** Authenticated sign-in, seed pipeline from Sheets, one hard-coded exam, sitting flow with snapshot, automatic scoring, results page. No email, no dashboard, no admin UI. Run it on a handful of volunteers.

**Phase 2 — Notification and analysis.** Queued email with the release gate, administrator view, facility and discrimination per question. Run the first real cohort.

**Phase 3 — Reuse.** Question pooling and randomisation, additional topics beyond RSAF structure, trend tracking across sittings.

### How we know it worked

| Measure | What good looks like |
| --- | --- |
| Participation | Most of the invited cohort sits, and the second round does not drop off |
| Item quality | Few items flagged for review after the first cohort; no negative discrimination left unresolved |
| Actionability | The results change what the OQ Programme teaches next |
| Reuse | A second topic is added without developer involvement beyond re-seeding |
| Trust | Candidates ask about their results rather than avoiding the exam |

The measure that matters most is the third. Scores that nobody acts on are an expensive way to produce a spreadsheet.
