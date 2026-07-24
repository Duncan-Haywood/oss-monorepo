# Learning Science, the AI Mentor, and the Knowledge Graph

Most edtech platforms bolt AI onto a course catalog. We are doing the
opposite: the pedagogy, the mentor, and the knowledge graph are one system,
designed together, from first principles. This document specifies that
system in enough detail to build it.

The question behind every section below is the same one from the brief:
**will this help someone become a better engineer?** Not "will this keep
them engaged," not "will this look good in a demo." Learning science tells
us what actually produces skill. The mentor is the delivery mechanism. The
graph is the mentor's map of the territory. Get all three wrong
independently and you get another course platform with a chatbot bolted on.
Get them right together and you get something close to a lab advisor who
never sleeps.

---

## 1. Learning Science and the Mastery Model

### 1.1 Why most engineering education doesn't produce skill

Universities are very good at transmitting information and very bad at
producing mastery. The reason isn't a lack of smart people — it's structural:

- **Lectures are a broadcast, not a feedback loop.** You cannot get better
  at a skill by watching someone else perform it. Watching a professor
  derive an equation is not practicing engineering, any more than watching
  a chess grandmaster's game is practicing chess.
- **Exams test recognition and recall under artificial constraints**, not
  the ability to build something that works. A student can pass a controls
  exam and be unable to tune a PID loop on a real motor with real noise and
  real backlash.
- **Semesters impose a fixed pace** unrelated to how any individual learns.
  Fast learners get bored and coast; slow learners get left behind and fake
  their way to a passing grade. Neither builds durable skill.
- **Grades reward local optimization** — cramming, guessing the professor's
  rubric, forgetting the material a week after the final — over the kind of
  slow, effortful consolidation that produces engineers who can still debug
  a circuit five years later.

None of this is a controversial claim. It's the replicated finding of
learning science for the last forty years. The problem was never that we
didn't know how people learn — it's that the infrastructure of a lecture
hall and a 15-week calendar cannot deliver it. An AI-native platform has no
such constraint. So we should actually use what's known.

### 1.2 The five pillars

**Deliberate practice (Ericsson).** Expertise isn't a function of raw
hours; it's a function of hours spent at the edge of current ability, with
immediate, specific feedback, on tasks designed to expose a *particular*
weakness. Free-form "practice" (doing more projects the way you already do
them) plateaus. Deliberate practice targets the failure mode directly: if a
learner keeps under-sizing heatsinks, the next few practice problems are
thermal-budget problems, not "another amplifier." This has direct
implications for platform design: the system needs to know *what a learner
is bad at*, not just what they've completed, and it needs to be able to
generate or select practice targeted at that specific gap. That's the job
of the mastery model (§1.4) and the mentor's problem generator (§2.3).

**Desirable difficulty (Bjork).** Effort that feels productive
(re-reading, watching a worked example, copying a reference schematic) is
often the least effective way to learn. Effort that feels *unproductive*
in the moment — retrieving an answer from memory instead of looking it up,
attempting a problem before being taught the technique, spacing practice
out instead of massing it — produces worse short-term performance and
better long-term retention. This is deeply counterintuitive and it cuts
directly against what makes a product "feel good" to use. The platform
has to be willing to make learners struggle, fail, and feel less fluent in
the moment, because that's the mechanism that produces durable skill. A
mentor that always smooths the path is a worse mentor, even if it produces
higher session-satisfaction scores.

**Spaced repetition and interleaving.** Skills decay. A learner who nails
Kirchhoff's laws in week 2 and never touches them again will have degraded
intuition by week 20, right when they need it for a more complex
project. The platform should resurface prior concepts inside *new* project
contexts (not flashcard drills, though those have a place for pure recall
items like component datasheets or standard values) on a schedule driven
by a forgetting-curve model, not a fixed syllabus. Interleaving — mixing
problem types instead of blocking them ("do 20 op-amp problems in a row")
— is harder in the moment and produces much better transfer, because it
forces the learner to first identify *which* technique applies, which is
the actual skill engineers need (nobody hands you a problem labeled "use
Thevenin's theorem here").

**Cognitive load theory (Sweller).** Working memory is small and fixed.
Novices spend most of their working-memory budget on things experts do
automatically (recalling Ohm's law, remembering where the ground symbol
goes, parsing datasheet notation), leaving little capacity for the actual
target skill (say, thermal design). This is why throwing a beginner
straight into an open-ended, realistic project without scaffolding
produces frustration, not learning — extraneous load crowds out germane
load. The platform manages this by:

- Sequencing projects so the *new* material in any given project is
  small relative to what's already automatic (this is what the
  prerequisite graph in §3 is for).
  - Providing scaffolds (component pickers, simulation sandboxes,
    pre-built subsystems) that offload the load of the *not-currently
    the point* parts of a project, and removing those scaffolds as a
    skill becomes automatic (this is a specific, trackable mastery
  transition — see §1.4).
- Making the mentor sensitive to load in real time: a learner who is
  visibly stuck on notation, not concept, gets a different intervention
  (a reference sheet) than one stuck on concept (a Socratic question).

**Mastery learning and Bloom's 2-sigma problem.** Bloom's 1984 finding
remains one of the most important results in education research and one of
the most consistently ignored: students who received one-on-one tutoring
combined with mastery-based pacing (not advancing until a concept was
actually mastered) performed two standard deviations better than students
in conventional classrooms — the average tutored student outperformed 98%
of the classroom control group. The effect was never disputed; it was
declared impractical, because you cannot give every student a personal
tutor. That's the entire bet of this platform: an AI mentor is the attempt
to make Bloom's 2-sigma result economically deliverable at civilization
scale. Two conditions have to hold for that bet to pay off:

1. **True mastery gating.** A learner does not advance past a
   prerequisite skill node until there's real evidence of competence —
   not "watched the video," not "attempted the project," but
   demonstrated the target skill under evaluation (§1.5). This is the
   part conventional platforms skip, because gating hurts completion
   metrics. We should embrace it, because we're optimizing for
   competence, not completion (see brief: "Success Metric").
2. **1:1 responsiveness at the moment of confusion.** The value of a
   tutor isn't the lecture, it's the immediate, personalized response to
   *this specific* wrong turn. A static curriculum with good content but
   no responsive tutor gets you maybe a fraction of the 2-sigma effect.
   The mentor architecture in §2 exists entirely to deliver this.

**Zone of proximal development (Vygotsky).** The productive learning zone
sits between "can already do alone" and "can't do even with help." Below
it: boredom, disengagement, no growth. Above it: frustration, guessing,
learned helplessness ("I'll just wait for the AI to tell me"). The
platform's central technical challenge is keeping every learner inside
their ZPD continuously, which requires (a) an accurate, current estimate
of what a learner can do alone, (b) a graph of what to attempt next that's
reachable with help, and (c) a mentor that provides exactly enough
scaffolding to make the next step possible without collapsing the
difficulty. Vygotsky's "help" is not "the answer" — it's scaffolding that
gets withdrawn as competence grows (see "hint fading," §2.4).

**Transfer of learning.** The hardest and most underrated problem in
education. Students routinely learn a technique in one context (a PID
controller in a controls-theory project) and fail to apply it in a
superficially different context (a drone autopilot, an espresso machine)
even though the underlying structure is identical. Transfer doesn't happen
automatically from exposure — it has to be deliberately engineered by:

- Teaching the *abstract structure* of a technique explicitly, not just
  the worked example ("this is a proportional-integral-derivative
  controller acting on an error signal" vs. "this is how you keep the
  greenhouse at 24°C").
- Deliberately varying the surface features of practice problems that
  share deep structure (interleaving, above).
- The knowledge graph explicitly modeling "transfers-to" edges (§3.2)
  and the mentor explicitly calling out structural analogies ("you
  solved this exact class of problem in the greenhouse project — what's
  the equivalent term here?").
- Cross-disciplinary projects that force the same concept to be
  re-applied in a different engineering discipline's vocabulary and
  constraints (mechanical resonance and electrical resonance are the
  same differential equation; almost no student is ever told this).

### 1.3 What "mastery" means here

We need a definition precise enough to gate advancement and drive
recommendations, not a vibe. Mastery of a skill node is **the demonstrated,
evidence-backed ability to apply that skill correctly, and to know when it
applies, under conditions that were not explicitly rehearsed.**

Three things are packed into that sentence and all three matter:

- "Apply correctly" — functional correctness, but see the AI Evaluation
  Dimensions in the brief: correctness is necessary, not sufficient.
- "Know when it applies" — transfer, not pattern-matching to a template.
  A learner who can only solve a PID problem when it's labeled "PID
  problem" doesn't have the skill.
- "Not explicitly rehearsed" — the evaluation has to include some novelty,
  or all we're measuring is memorization of the specific worked example.

### 1.4 A mastery scale

Five levels per skill node, deliberately closer to a professional
competency scale (think: how an engineering manager actually talks about a
report's skills) than a school letter grade:

| Level | Label | What it means | Typical evidence |
|---|---|---|---|
| 0 | **Unseen** | No exposure yet | — |
| 1 | **Novice** | Can execute the skill with heavy scaffolding and a worked example to follow; cannot explain *why* | Completed guided exercise; can't answer "why" probes |
| 2 | **Competent** | Can execute the skill independently in familiar contexts; explanations are correct but shallow | Solo project completion; passes standard evaluation criteria |
| 3 | **Proficient** | Applies the skill correctly in novel/unfamiliar contexts; makes sound tradeoffs; catches own errors | Successful transfer task; debugging session showing self-correction; design decisions with justified tradeoffs |
| 4 | **Expert** | Teaches/reviews the skill in others' work; recognizes edge cases and failure modes before they occur; operates efficiently under ambiguity | Reviews peer work accurately; anticipates failure modes unprompted; extends the technique beyond taught scope |

This scale is per skill *node* — a learner has a mastery level for
"MOSFET switching," a different one for "thermal derating," a different
one for "PID tuning." There is no single "level" for a learner; there's a
vector across the whole graph. That vector, not a completed-projects
count, is the actual student model (§2.1).

Movement between levels is **evidence-driven and bidirectional.** Mastery
is not monotonic — it decays without use (spaced repetition, §1.2), and a
bad debugging session can reveal that a "proficient" rating was optimistic
and needs revision downward, exactly like a real performance review would
update on new information.

### 1.5 Mapping evidence to mastery updates

This is the concrete mechanism, because "the AI evaluates mastery" is
meaningless without specifying what it looks at and how that maps to a
number.

**Evidence sources**, roughly in ascending order of signal strength:

1. **Guided exercise completion** — low signal, mostly gates Unseen →
   Novice. Confirms exposure, not competence.
2. **Project artifacts** — the code, schematic, CAD file, calculation
   sheet, or BOM itself. Static review of the *artifact* (does the
   circuit actually implement the stated design? are the tolerances
   sane? is the code free of the misconception patterns tagged on this
   node?) is a moderate signal.
3. **Process, not just product** — commit history, revision history,
   simulation-run history. A learner who arrived at a correct schematic
   after eleven thoughtful, hypothesis-driven iterations demonstrates
   more mastery than one who pasted a correct answer in one shot. The
   mentor should have access to *how* the artifact was produced, not
   just the final state.
4. **Live debugging sessions** — the single highest-signal evidence
   source. Watching a learner form a hypothesis, design a test, interpret
   an unexpected multimeter/oscilloscope/simulation result, and revise —
   this is close to a direct read on proficient-level reasoning, because
   it can't be faked by copying a reference design.
5. **Explain-your-reasoning checkpoints** — the mentor asking "why did
   you choose this value?" before confirming correctness (§2.4). Correct
   artifact + correct reasoning = strong evidence for Competent/Proficient.
   Correct artifact + wrong or absent reasoning = flag for shallow
   pattern-matching, caps the update at Novice/Competent regardless of
   whether the artifact worked.
6. **Transfer tasks** — a deliberately novel problem sharing deep
   structure with a mastered node but different surface features. Success
   here is close to necessary for a Proficient rating; it's the only
   evidence type that rules out memorization.
7. **Peer/cross-review and teaching-back** — a learner correctly
   critiquing someone else's design against the same evaluation
   dimensions is Expert-level evidence, and doubles as practice for the
   reviewer.

**A second axis: unaided vs. AI-assisted.** Every evidence source above can
be gathered in either of the two modes described in §2.4 — production mode
(AI-assisted, the default while building) or mastery-checkpoint mode
(unaided, periodic, deliberately gated) — and the mode changes how much a
given observation is allowed to move the posterior, independent of which
source it is. The same live debugging session (source #4) is strong
evidence when it happens unaided at a checkpoint; it's still useful signal
when it happens during AI-assisted production work, but it's now entangled
with the AI's contribution, and the mentor genuinely can't fully separate
"the learner reasoned this out" from "the copilot suggested it and the
learner accepted it." So checkpoint-mode evidence updates both the point
estimate and the confidence at full weight; production-mode evidence still
counts — it's not discarded, an AI-assisted debugging session still shows
*something* — but it caps the confidence contribution below what the same
evidence would earn unaided, and a learner cannot reach a high-confidence
Proficient or Expert rating on production-mode evidence alone. This isn't a
new mechanism; it's the same principle behind the evidence-source ranking
above and the gaming guardrail in §2.4, applied to a second dimension:
evidence strength depends on how the evidence was produced, not just what
it shows.

**Update mechanism, conceptually:** each skill node maintains a mastery
estimate with an associated confidence (a Bayesian-style belief, not a
hard integer — think closer to an Elo rating or a Bayesian Knowledge
Tracing posterior than a checkbox). Every piece of evidence above is an
observation that updates the posterior for the relevant node(s) — a single
project typically touches multiple nodes, so one debugging session can
move several mastery estimates simultaneously. Confidence matters as much
as the point estimate: a learner with one Competent-level project has a
low-confidence Competent rating and should get more evaluation before
being gated forward; a learner with five consistent, varied, high-signal
observations has a high-confidence rating and the graph can advance them
readily. Decay is modeled explicitly: nodes untouched for a long stretch
lose confidence over time (not necessarily the point estimate itself, but
the system's certainty in it), which is what triggers spaced-repetition
resurfacing in new project contexts before the estimate is allowed to
decay further.

This mastery vector is the actual product the platform is building.
Completed-projects count, streaks, and time-on-platform are vanity
metrics; the mastery vector — a live, evidenced, decaying, per-node model
of what a specific person can actually do — is the thing an employer
should eventually be able to trust more than a transcript.

---

## 2. AI Mentor Architecture

A mentor is not a chatbot with an engineering system prompt. A chatbot
answers whatever's asked. A mentor has an agenda — it knows the learner,
knows the domain, and decides *what to do* independent of what's asked,
including sometimes declining to answer the literal question in favor of
the thing that actually builds skill. That requires more structure than a
prompt. Concretely, the mentor needs four cooperating models:

```
                     ┌────────────────────────┐
                     │      DOMAIN MODEL       │
                     │  (knowledge graph —      │
                     │   full design in doc 03) │
                     └───────────┬─────────────┘
                                 │ informs
                                 ▼
┌──────────────┐   reads    ┌─────────────────────┐   selects   ┌───────────────┐
│ STUDENT MODEL │◄──────────│ PEDAGOGICAL POLICY   │────────────►│ ACTION SPACE   │
│ (per-learner   │  updates  │ (when to hint, ask,  │             │ hint / ask /   │
│  mastery       │◄──────────│  stay silent,        │             │ silent /       │
│  vector +      │  new      │  escalate)           │             │ escalate /     │
│  history)      │  evidence └─────────┬─────────────┘             │ review / assign│
└──────────────┘                       │                          └───────┬────────┘
       ▲                               │ triggers                        │
       │                               ▼                                 ▼
       │                    ┌─────────────────────┐          ┌────────────────────┐
       └────────────────────│ EVALUATION / REVIEW   │◄─────────│ INTERACTION LAYER   │
         evidence extracted │ ENGINE (multimodal:   │  submits │ (chat, code review, │
                             │ code, CAD, schematic, │  work    │ live debug session) │
                             │ calc, photo/video)    │          │                    │
                             └───────────────────────┘          └────────────────────┘
```

### 2.1 The student model

The student model is the mastery vector from §1.4–1.5, plus the context
needed to act on it:

- **Per-node mastery estimate + confidence + last-touched timestamp**
  across every node in the domain graph the learner has any evidence for.
- **Misconception history** — a log of specific, named misconceptions
  detected (§2.3), not just "got it wrong." "Confuses average current
  with RMS current" is actionable; "missed question 4" is not.
- **Working-style signals** — does this learner tend to guess-and-check
  versus reason-first? Do they read datasheets before asking? Do they
  abandon debugging quickly and ask for the answer? These affect *how*
  the mentor should intervene (§2.4), independent of what they know.
- **Current cognitive load indicators** — session-level signals (time
  stuck on one step, repeated identical failed attempts, rapid
  frustrated re-submission) that modulate the pedagogical policy in the
  moment, separate from the longer-run mastery estimate.
- **Goals and trajectory** — declared interests (e.g., wants to end up
  doing robotics, not analog IC design) that bias project recommendation
  within what the graph says is reachable.
- **AI-assistance history** — which submissions were produced in
  production mode (AI-assisted) versus mastery-checkpoint mode (unaided),
  per node. This is what lets the evidence-weighting logic in §1.5 tell
  the two apart, and it's what tells the policy engine (§2.4) when a node
  has accumulated enough AI-assisted "it works" evidence that it's due for
  an unaided checkpoint before the mastery vector can move any further.

### 2.2 The domain model

Document 03 covers the graph's internal design in full. What the mentor
needs from it, at a conceptual level, is three query capabilities:

1. **"What does node X require?"** — the prerequisite closure, used to
   check whether a learner is actually ready for a project or is missing
   a foundation (and if so, which specific foundation to shore up first).
2. **"What does mastering node X unlock or reinforce?"** — used for
   recommendation (§2.3) and for showing a learner *why* a given project
   matters, which is itself a motivational and transfer-supporting move
   ("this is the same PID structure you'll need for the drone project
   later").
3. **"What's commonly confused with node X?"** — used by the misconception
   detector to disambiguate *why* an answer is wrong, not just *that* it's
   wrong.

The mentor treats the graph as ground truth for structure (what depends on
what) and treats the student model as ground truth for *this learner's*
current position in that structure. Pedagogical policy is the function
that combines them into an action.

### 2.3 Core mentor capabilities

**Socratic teaching.** Default mode for concept introduction and for
responding to "I don't understand X." Never open with the explanation;
open with a question that forces the learner to locate what they already
know relative to X, then narrow. See §2.4 for the concrete ladder.

**Multimodal review.** The evaluation engine has to handle heterogeneous
artifacts, each with different failure modes worth catching:

- **Code** — correctness, but also style, error handling, resource
  management, and (critically) whether it matches the stated design
  intent, not just whether it compiles and runs.
- **Schematics** — netlist-level correctness, but also decoupling
  placement, ground topology, unlabeled nets, missing protection
  circuitry, part footprints that don't match the BOM.
- **CAD** — tolerance stack-up, DFM red flags (undercuts, wall
  thickness, unsupported overhangs for the stated manufacturing
  process), interference checks, whether the model matches the stated
  material's real properties.
- **Calculations** — not just "is the final number right" but whether
  the *method* is sound, units are consistent, and safety margins are
  reasonable — a calculation that happens to land on the right number
  through cancelled errors should not pass review.
- **Physical prototype photos/video** — this is the hardest and most
  distinctive capability, and it matters because engineering doesn't end
  at simulation. The mentor should be able to look at a photo of a solder
  joint and flag a cold joint, watch a video of a mechanism and flag
  binding or resonance, listen to audio from a motor and flag bearing
  wear. This is the review capability that most differentiates "AI
  mentor for engineers" from "AI mentor for CS students," and it should
  be treated as a first-class capability from the MVP, not a later
  add-on, because so many EE/embedded projects in the brief's curriculum
  culminate in a physical artifact.

**Practice generation.** Given a target node and a mastery gap
(§1.5), generate a novel problem that exercises specifically that gap —
not a generic problem from a bank, but one parameterized against the
learner's actual misconception. If the misconception log says "confuses
average and RMS current," the generated practice should be a problem
where that confusion produces a specific, checkable wrong answer, so the
mentor can confirm on resubmission whether the misconception is actually
resolved or just papered over.

**Misconception detection.** The highest-leverage capability, because a
wrong answer is underdetermined — there are usually several distinct
wrong mental models that produce the same wrong final number, and each
needs a different fix. The domain graph tags each concept node with a set
of known misconceptions (informed by expert authoring initially,
refined by observed error patterns over time — see doc 03 §on
data-driven refinement). Detection works by pattern-matching the
*shape* of the error (which values, which order of operations, which
edge case) against those tagged patterns, not just checking the final
answer against a key. This is what lets the mentor say "you're treating
this as a series circuit when the 5V rail load makes it a divider" instead
of just "incorrect."

**Long-term mastery tracking.** The persistence and update mechanism
described in §1.5, running continuously in the background of every
interaction, not as a separate "assessment mode."

**Next-project recommendation.** A ranked set of reachable projects,
using the domain graph's "what does mastering X unlock" query, filtered
to what's inside the learner's ZPD (§1.2) and weighted by the learner's
stated interests and the assessment balance called for in the brief
(foundational / useful-product / open-ended / capstone — a learner who's
only ever done foundational drills gets nudged toward a useful product
next, not another drill).

### 2.4 Pedagogical policy: the hard problem

The central risk of an AI mentor is that it's *too* good at giving
answers. A model that can solve the problem instantly has to be
deliberately constrained to not do that, while still being useful enough
that learners don't churn out of frustration. This tension is the whole
design problem of §2.4, and it's worth being explicit that it cannot be
solved with a single system-prompt instruction like "don't give away
answers" — that collapses under any persistent user ("just tell me,
please") and produces a mentor that's either useless or trivially
jailbroken. It needs structure.

That structure starts one level up from the hint ladder itself, with a
question the policy engine answers before anything else: **is this
learner doing production work right now, or is this a mastery
checkpoint?** The platform is AI-assisted, not anti-AI (see the brief,
"Stance on AI: Assisted, Not Anti-AI") — a learner iterating on the actual
project, writing the actual firmware, laying out the actual PCB, should
get a mentor that helps the way a good AI copilot helps a practicing
engineer: drafting code, checking a calculation, proposing a CAD fix.
Refusing that would train someone for a version of the job that no longer
exists, and would make the platform's mentor a worse copilot than the one
the learner will just use instead the moment they leave it.

But that only works if the learner can still function without the
copilot — a learner who can't reason about a circuit without an LLM can't
tell when the LLM is wrong, and "knows how to prompt" is not the mastery
signal the vector in §1.4 is supposed to represent. So the policy engine
runs two distinct branches, and everything below should be read as
belonging to one or the other:

- **Production mode** (the default while building, iterating, shipping a
  project). The mentor is a collaborator, not a gatekeeper: it can write
  code, run a calculation, or suggest a CAD change on request, without
  routing through the hint ladder first. Covered in "Production mode: the
  mentor as collaborator," at the end of this section.
- **Mastery-checkpoint mode** (periodic, deliberately unaided, and flagged
  to the learner as such before it starts). This is where the hint
  ladder, reasoning-before-verdict, the silence budget, and escalation —
  everything from here through "Guardrail against gaming" below — apply
  at full strength, because it's the only mode where the resulting
  evidence is trustworthy enough to move the mastery vector (§1.5).

**The hint ladder.** Every "I'm stuck" or wrong-submission moment routes
through an escalating sequence, and the mentor is only allowed to move to
the next rung after the current one has been tried and evidence gathered
that it wasn't enough — not on request:

1. **Clarifying question** — "What have you tried? What did you expect
   to happen, and what happened instead?" (Also the first diagnostic —
   often the learner answers their own question here.)
2. **Redirect to a known resource** — "You solved a version of this in
   the [prior project]. What's different this time?" (Activates transfer,
   §1.2, instead of teaching fresh.)
3. **Targeted question that narrows the search space** — "What's the
   voltage across R2 if no current flows into the op-amp input?" (Points
   at the relevant principle without stating it.)
4. **Partial principle, not partial answer** — "This is a case where
   input impedance matters." (Names the concept; the learner still has to
   apply it.)
5. **Worked sub-example on an analogous but not identical problem** — the
   last rung before directly solving *this* problem, and closer to
   scaffolding than answering.
6. **Full explanation** — reserved for cases where the learner has
   genuinely exhausted the above (evidenced by multiple honest attempts,
   not by asking nicely) *and* explicitly the mentor should treat this as
   a partial failure of the interaction, logging that the ZPD estimate
   for this node was probably wrong (too hard, not enough scaffolding
   earlier) so the graph/recommendation can adjust rather than repeating
   the same miss.

Critically: **hints fade, they don't reset.** As a learner's mastery on a
node climbs, the ladder starts one or two rungs higher next time (a
Proficient-level learner shouldn't get the same clarifying-question
treatment as a Novice) — this is the direct implementation of Vygotsky's
scaffolding-withdrawal.

**"Explain your reasoning before I tell you if you're right."** This is
the single highest-leverage interaction pattern for both (a) preventing
answer-dependency and (b) generating the reasoning-evidence needed for
mastery updates (§1.5). Before confirming or denying correctness on any
non-trivial submission, the mentor asks for the justification first. This
does three things simultaneously: it forces retrieval and self-explanation
(both independently well-evidenced for learning), it surfaces
misconceptions that a correct final answer would hide (right answer,
wrong reason — very common, and invisible to answer-only checking), and it
denies the easy path of "guess, get told, guess again" that turns a
learning interaction into slot-machine behavior.

**When to stay silent.** Underrated mentor capability. Productive struggle
(§1.2) requires the mentor to *not* intervene at the first sign of
difficulty. Concretely: the policy should have a minimum "struggle
budget" — a floor on time-on-task or attempt-count — before any
proactive hint fires, distinct from the reactive ladder above which
triggers on the learner *asking*. The two failure modes to avoid are
symmetric: intervening too early robs the learner of the desirable
difficulty that produces retention; intervening too late (or never)
produces frustration and disengagement. The threshold should be a
function of the learner's own history (a learner who reliably self-rescues
within 15 minutes gets a longer silent budget than one who spirals into
unproductive flailing), not a fixed global timer.

**When to escalate rather than assist.** If a learner is proficient and
cruising, the correct move is often not encouragement but a harder
variant — "before you finalize this, what happens if the supply drops to
3.3V?" — deliberately reintroducing desirable difficulty rather than
letting a learner coast on a project that's now below their ZPD. This is
the same policy engine, just pointed the other direction: the mentor is
always asking "is this learner currently in their ZPD," and can answer
that "no, too easy" just as validly as "no, too hard."

**When to flag design quality beyond correctness.** Independent of the
hint ladder for *correctness*, the mentor runs the evaluation dimensions
from the brief (economical, manufacturable, reliable, maintainable,
competitive) as a second pass on any completed artifact, even a correct
one — this is where prompts like the brief's "your BOM is $145, can you
hit $100" live. These are framed as questions, not fixes, for the same
answer-dependency reasons as the hint ladder.

**Guardrail against gaming.** Because hints are logged and mastery is
evidence-based, a learner who fast-forwards through the ladder by
repeatedly saying "I don't know" to skip straight to rung 6 produces a
visible pattern (never actually attempts, low-effort clarifying answers,
short time-on-task) that the student model can detect and that caps the
resulting mastery update — reaching the full explanation via
transparent avoidance doesn't earn a Competent rating, because the
evidence-strength of that path is explicitly weighted lower (§1.5,
evidence source #1 vs. #4) — the same logic that caps production-mode
evidence below unaided-checkpoint evidence for the AI-assistance axis
(§1.5). The system is honest with itself about how strong its evidence
is, and a learner cannot manufacture strong evidence by being persistent
about wanting the answer, whether the persistence is aimed at the mentor
or at an external AI tool during a checkpoint.

**Production mode: the mentor as collaborator.** Outside checkpoints, the
mentor's default posture inverts. Production work isn't where the
platform is trying to prove what a learner can do unaided — it's where
the platform is trying to get a real project built, using the same
AI-assisted workflow a working engineer uses today. The mentor can draft
a chunk of firmware, run a calculation, propose a component substitution,
or suggest a CAD fix directly, without first routing through the hint
ladder. It still asks for the reasoning behind a choice when that's cheap
and low-friction (the "explain-your-reasoning" pattern above is valuable
wherever it shows up, not only at checkpoints — it's just not gating
progress here), but production mode does not withhold help as a default.

Two things keep production mode from quietly swallowing the whole system.
First, it's cost-bounded by design, not just by pedagogy: generative
assistance (writing code, drafting a CAD change) is the expensive kind of
AI interaction relative to a Socratic question, and the brief's
global-access goal — it would be a genuine win if a learner in Lagos could
reach the same competence ceiling as one in Boston — depends on keeping the
marginal cost of that assistance low enough to subsidize at scale (see the
brief, "Business Principles: Sustainable, Not Extractive"). An architecture
that lets production mode run unbounded generation for every learner on
every request doesn't scale to that goal, so the policy engine should reach for
the cheapest intervention that actually unblocks the learner — a targeted
answer, a reference snippet, a bounded calculation — before reaching for
open-ended generation. Second, and pointing the same direction, the
mentor models *efficient* AI collaboration rather than just doing the
work for the learner: specific, well-scoped requests instead of "build
the whole subsystem," and verifying generated output instead of pasting
it in blind. That's not a constraint bolted onto good pedagogy — it's the
actual skill a practicing AI-assisted engineer needs, and it's exactly
what a learner who only ever saw checkpoint-mode terseness or
production-mode largesse would never pick up on their own. The knowledge
graph treats it accordingly: "effective AI-assisted engineering" is a
skill node like any other, not just an ambient assumption (§3.1).

---

## 3. Knowledge Graph Design

The domain model referenced throughout §2 is a graph, not a linear
syllabus, because engineering knowledge isn't linear — it's a dense mesh
of prerequisites and reinforcements that crosses discipline boundaries
constantly (a PID loop is a PID loop whether it's holding a greenhouse at
temperature or a drone at altitude). This section gives the conceptual
design; the full authoring workflow, storage/query architecture, and
graph algorithms are the subject of document 03. What follows is scoped to
what §1 and §2 assume the graph provides.

### 3.1 Node types

- **Concept nodes** — a unit of understanding, not yet a demonstrated
  skill. "Thevenin equivalence." "The heat equation." "Race conditions."
  Concepts can be understood without being able to apply them under
  realistic constraints — that gap is exactly why concept and skill are
  separate node types.
- **Skill nodes** — an applied, evaluable capability, usually resting on
  one or more concept nodes. "Deriving a Thevenin equivalent for an
  unfamiliar network." "Sizing a heatsink from a power dissipation
  budget." "Debugging a race condition from a hung trace log." Skill
  nodes are what the mastery model (§1.4) actually tracks — concept
  nodes are typically Unseen/Novice/Competent only ("understood the
  idea" caps out below "applies it under novel conditions"), since
  demonstrating a concept always routes through some skill. "Effective
  AI-assisted engineering" — knowing what to delegate to a copilot, how
  to specify it well, and how to verify the result — is modeled as a
  skill node like any other, with its own prerequisites (you can't verify
  a generated circuit you don't understand) and its own misconceptions
  (trusting fluent-sounding but wrong output), not treated as an
  ambient assumption or tolerated side effect of production mode (§2.4).
- **Project nodes** — a bundle of skill nodes exercised together in a
  realistic build, with metadata: which skills it exercises and at what
  target mastery level, what evidence types it produces (code artifact?
  schematic? physical prototype?), and where it falls on the
  foundational/useful-product/open-ended/capstone axis from the brief.
- **Misconception nodes** — a specific, named wrong mental model attached
  to one or more concept/skill nodes ("treats RMS and average current as
  interchangeable," "assumes op-amp output can source unlimited
  current"). These exist as first-class nodes, not just tags, because a
  single misconception often attaches to several skill nodes at once and
  because misconceptions themselves have relationships (one misconception
  commonly causes a predictable cascade of others).

### 3.2 Edge types

- **prerequisite-of** — directed, "must have competent-level mastery of A
  before attempting B." This is the edge the readiness check (§2.2, query
  1) walks. Weighted by how hard a requirement it is — some
  prerequisites are load-bearing (you cannot attempt embedded PID control
  without discrete-time control theory) and some are soft
  ("recommended, not required" — a strict prerequisite graph that never
  admits soft edges becomes brittle and over-gates).
- **reinforces** — undirected-ish (practically bidirectional in effect),
  "practicing A also exercises B." This is what enables interleaving
  (§1.2) and spaced resurfacing — a new project on an unrelated topic
  that happens to reinforce a decaying node is a better recommendation
  than a pure drill on that node, because it's simultaneously new
  learning and review.
- **transfers-to** — directed, connects a skill in one context to the
  *structurally identical* skill in a different surface context across
  disciplines. PID control (mechanical, electrical, thermal, or chemical
  process instantiations) is the canonical example; resonance
  (mechanical vibration vs. electrical LC resonance vs. acoustic
  resonance in enclosure design) is another. This edge type is what the
  mentor uses to explicitly prompt transfer ("you've solved this exact
  structure before, in a different domain — what's the analogous
  variable here?") rather than leaving transfer to chance.
- **commonly-confused-with** — connects a concept/skill node to the
  misconception nodes learners predictably form around it, and sometimes
  connects two legitimate concept nodes that learners conflate (average
  vs. RMS; stress vs. strain; latency vs. throughput). This is the edge
  the misconception detector (§2.3) walks to disambiguate an error.

```
        prerequisite-of
   [Ohm's Law] ─────────────► [Series/Parallel Analysis]
        │                              │
        │ prerequisite-of              │ prerequisite-of
        ▼                              ▼
  [Op-Amp Basics] ──reinforces──► [Filter Design]
        │
        │ transfers-to
        ▼
  [Discrete-Time Control] ──prerequisite-of──► [PID Tuning]
                                                     │
                             ┌───────────transfers-to┼───────────────┐
                             ▼                        ▼               ▼
                  [Greenhouse Controller]   [Drone Autopilot]   [Espresso Controller]
                        (project)               (project)          (project)

  [RMS vs. Average Current] ◄──commonly-confused-with── [Average Current]
```

### 3.3 Using the graph: readiness, gaps, sequencing

- **Readiness check.** Before a learner starts a project, walk the
  prerequisite closure of every skill node the project exercises. Any
  node below the required mastery threshold (with reasonable confidence
  — see §1.5) is a gap. Hard-prerequisite gaps block the project with a
  specific, named reason ("this needs competent-level discrete-time
  control, which you're at novice on") rather than a generic "you're not
  ready." Soft-prerequisite gaps produce a warning, not a block, and the
  mentor can decide in the moment whether the project is still a
  reasonable stretch.
- **Gap-filling recommendation.** When a gap blocks a desired project,
  the graph can immediately propose the smallest set of intermediate
  projects that close it — not "go back to the beginning," but the
  shortest path through the prerequisite graph from current mastery to
  required mastery. This is what makes project selection feel adaptive
  rather than like a fixed track.
- **Sequencing for spaced reinforcement.** The recommendation engine
  doesn't just walk forward through prerequisites — it also looks at
  which mastered-but-decaying nodes a candidate project would reinforce,
  and prefers projects that both advance the frontier and refresh
  something older. This is the graph-level implementation of spaced
  repetition from §1.2, and it's why reinforces edges exist as a
  distinct type from prerequisite-of, even though both are "relatedness."
- **Cross-disciplinary sequencing via transfers-to.** When a learner
  masters a node with outgoing transfers-to edges, those target projects
  become newly and specifically recommendable, with the mentor able to
  frame *why* ("you now have everything you need, structurally, to build
  a drone autopilot — the PID loop is the same shape as the greenhouse
  controller"). This is the graph mechanism that produces the brief's
  "cross-disciplinary thinking" principle as an emergent behavior of
  recommendation, not a separately hand-authored track.

### 3.4 Authoring and maintenance

A graph this large — spanning ME, EE, CS/embedded, civil, chemical, and
robotics, per the brief's curriculum — cannot be hand-authored exhaustively
up front and cannot be trusted if it's generated with no expert oversight
either. The practical approach is three-layered:

1. **Expert-authored seed graph.** Domain experts in each discipline
   define the core skill and concept nodes, the load-bearing
   prerequisite edges, and — critically — the well-known misconceptions
   for foundational nodes (these are well documented in engineering
   pedagogy research and in experienced instructors' heads; capturing
   them explicitly is high-leverage and doesn't require guessing). This
   seed doesn't need to be complete, but it needs to be *correct* for the
   nodes it covers, because early learners' mastery models depend on it
   and errors here compound.
2. **AI-assisted expansion.** Given the seed graph's structure and
   conventions, an AI-assisted process proposes new nodes, edges,
   projects, and candidate misconceptions — e.g., extending a
   well-modeled EE subgraph into an analogous but under-modeled chemical
   process-control subgraph, or drafting transfers-to edges between
   disciplines that a single human expert might not think to connect
   (most graph-scale cross-disciplinary insight is more likely to come
   from a system that has ingested all disciplines' material at once than
   from any one human specialist). All AI-proposed structure is a draft,
   reviewed by a domain expert before it affects live mastery gating —
   this is not a place to auto-merge.
3. **Data-driven refinement from learner performance.** Once the platform
   has real usage data, the graph should be continuously checked against
   it, not treated as fixed: prerequisite edges whose "prerequisite"
   nodes turn out not to predict success on the "dependent" node (learners
   regularly succeed on B despite low mastery of claimed-prerequisite A)
   are candidates for weakening or removal; two nodes with highly
   correlated failure patterns are candidates for a missing
   commonly-confused-with or reinforces edge; a misconception pattern
   showing up in error data that isn't yet tagged on any node is a
   candidate for a new misconception node. This refinement loop is what
   keeps the graph honest over time instead of ossifying around one
   cohort of experts' initial intuitions — and it's the same underlying
   mechanism (evidence updates beliefs) as the per-learner mastery model
   in §1.5, just applied at the population level instead of the
   individual level.

### 3.5 Cross-disciplinary linking as a design principle, not an afterthought

The brief's worked examples (PID control → greenhouse / drone / espresso;
resonance → frame design / IMU placement) are not incidental flavor —
they're evidence that the underlying engineering concepts are
discipline-agnostic far more often than curricula built discipline-first
ever surface. A graph organized primarily by discipline (ME nodes, then EE
nodes, then CS nodes) will under-produce transfers-to edges by
construction, because authors working within one discipline's
vocabulary rarely think to check whether they've just re-derived a
structure from another discipline under a different name. The graph
should instead be organized around *structural primitives* that cut across
disciplines — feedback control, resonance and vibration, thermal/fluid
transport, structural loading, signal-vs-noise, discretization error — with
discipline-specific projects as leaves hanging off those shared structural
nodes. This is what makes it possible for a single "PID Tuning" skill node
to sit upstream of a greenhouse controller, a drone autopilot, and an
espresso temperature controller simultaneously, and for the mentor to
treat a learner's second and third encounters with that node as transfer
practice rather than as learning the concept from scratch each time —
which is, ultimately, the entire point: an engineer who has internalized
PID control as a transferable structure rather than three unrelated
recipes is a categorically better engineer, and is the outcome this whole
system is built to produce.
