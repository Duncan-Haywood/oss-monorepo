# Curriculum and Assessment

## Part 1: Project Progression (Beginner → World Class)

### Why a tier system instead of a course sequence

Universities sequence by subject: Circuits I, Circuits II, Signals and Systems, then a senior design capstone that's the first time anyone builds something real. That ordering optimizes for how departments are staffed, not how competence is built.

We sequence by constraint. A beginner and a startup founder can work on conceptually similar circuits — an amplifier is an amplifier — but the constraints placed on the design are completely different. The beginner is told "make it work." The startup-tier student is told "make it work, for under $8 in BOM cost, survive a 1-meter drop onto concrete, pass FCC Part 15, and beat the $40 competitor on the market." Same topology, radically different engineering.

This means the curriculum's real backbone isn't "topics covered," it's "constraints imposed." Each tier adds a constraint the previous tier didn't have to satisfy. That's what makes the progression teach judgment instead of just accumulating facts.

### The six tiers

| Tier | Central question | New constraint added |
|---|---|---|
| 1. Beginner | Does it work at all? | None — correctness only |
| 2. Useful product | Does it solve a real problem for a real user? | Usefulness, basic usability |
| 3. Slightly harder product | Does it work under realistic conditions? | Robustness, edge cases, integration of subsystems |
| 4. Commercial-quality product | Would a stranger pay for this and not regret it? | Cost target, reliability, documentation, safety |
| 5. Manufacturable product | Can 1,000 of these be built by someone who isn't you? | DFM/DFA, tolerances, sourcing, test procedures at scale |
| 6. Startup-quality product | Does this survive contact with a market? | Competitive benchmarking, unit economics, positioning, iteration under user feedback |

Each tier is not a fixed number of weeks. It's a bar a project has to clear. A student might spend three projects at tier 3 before a mentor judges they're ready for tier 4. Progression is per-project and per-topic, not per-semester — a student can be at tier 5 in embedded firmware and tier 2 in power electronics simultaneously, because those are different skill threads (more on branching below).

### What actually changes, tier by tier

**Tier 1 — Beginner.** Goal is functional correctness and building comfort with tools. Failure mode to avoid: abstraction without hands. A beginner circuits student should be soldering, measuring with a multimeter, and looking at a scope by week one, not deriving Thevenin equivalents on paper for a month first. The AI mentor's job here is mostly Socratic: "you measured 3.3V but expected 5V — where would you look first?" Grading criterion: it works, and the student can explain why.

**Tier 2 — Useful product.** The project must solve a problem for an actual person — even if that person is the student themselves or a family member. This is the first time "who is this for" enters the picture. Constraint added: usability. A working circuit that nobody can operate isn't done yet. Example: a beginner tier-1 exercise is "build a circuit that blinks an LED." A tier-2 version of the same skill is "build a nightlight that turns on automatically at dusk and doesn't drain a 9V battery in under a month" — same core electronics (comparator, phototransistor, low-power design), but now it has to actually get used by someone and survive being left on a nightstand.

**Tier 3 — Slightly harder product.** The system now has multiple interacting subsystems, and the world gets to be uncooperative. Sensors are noisy. Power supplies sag under load. Wireless links drop packets. The constraint is robustness: what happens at the edges, not just the happy path. This tier is where debugging under uncertainty becomes a first-class skill, not an occasional annoyance. Grading starts asking "what did you do when it didn't work the first time," because at this tier it usually doesn't.

**Tier 4 — Commercial-quality product.** This is the biggest jump in the whole progression, because it's where the project stops being "an engineering exercise that happens to work" and starts being "a thing that could plausibly be sold." New constraints arrive all at once: a real cost target, documented design rationale, basic safety analysis (what happens if it's misused, gets wet, overheats), and a BOM that a stranger could read and understand. The AI mentor at this tier pushes hard on tradeoffs: "your BOM is $145, the target is $100 — where does the $45 come from and what would you cut?"

**Tier 5 — Manufacturable product.** Now the question isn't "can I build one," it's "can someone who has never seen this design build a thousand of them correctly." This introduces design-for-manufacturing and design-for-assembly thinking: tolerance stack-up, whether a part can be reflow-soldered vs. requires hand assembly, whether an enclosure can be injection-molded without undercuts, whether the test procedure can be executed by a technician in under 90 seconds using a written script rather than the designer's intuition. Sourcing enters too — is every part on the BOM available from more than one supplier, and what's the lead time risk?

**Tier 6 — Startup-quality product.** The constraint is the market itself. The student now has to answer: who are the competitors, what do they charge, why would someone choose this over them, and — critically — does the design change when real users touch it. This tier explicitly includes an iteration loop driven by outside feedback (a small beta group, a community post, a Reddit thread of actual users), not just mentor feedback. This is the tier that produces the "1 product generating revenue" outcome from the mission statement — not every student reaches it, and that's fine; tier 5 is already a legitimate, credible endpoint for a portfolio piece.

### Worked example 1: Electrical Engineering

A single thread — audio electronics — carried across all six tiers:

1. **Beginner** — Build a simple single-transistor common-emitter amplifier on a breadboard. Goal: it amplifies a signal, measured on a scope. No enclosure, no cost target.
2. **Useful product** — Build a headphone amplifier that a friend would actually use with their existing headphones. Constraint: must run 8+ hours on a 9V battery, must not audibly hiss.
3. **Slightly harder product** — Build a guitar pedal (e.g., an overdrive circuit) with true bypass switching, that survives being stepped on, and doesn't pop or click when engaged. Constraint: mechanical robustness plus signal integrity under a stompbox form factor.
4. **Commercial-quality product** — Build a microphone preamp for under $30 in parts, with a documented noise budget (target: better than -90 dBu EIN), a write-up explaining every component choice, and basic protection against phantom-power miswiring.
5. **Manufacturable product** — Take the preamp to a 2-layer PCB designed for panelized SMT assembly, spec every part with two approved suppliers, write a 60-second QC test script (inject 1kHz tone, verify gain and THD on a bench fixture), and design an enclosure that can be CNC'd or injection molded at a 1,000-unit run.
6. **Startup-quality product** — Position the preamp against the Cloudlifter and the Fethead. Justify the price point, identify the customer (podcasters vs. musicians vs. field recordists), run a 10-person beta, and revise the design based on what they actually complain about (probably: they want phantom power passthrough, which you didn't budget for).

The same student, in parallel, might run a second thread in **power electronics** (LED driver → solar charge controller → benchtop power supply → ...) and a third in **RF** (FM receiver → LoRa sensor node → ...). All three threads share tier definitions, so "tier 4" means the same rigor bar no matter which thread it's attached to, even though the topics are unrelated.

### Worked example 2: Robotics / Mechanical

1. **Beginner** — Build a 2-wheeled robot that drives forward, reverses off a wall bump sensor, and turns. Goal: closed-loop-free correctness, understanding motors and basic control flow.
2. **Useful product** — Build a line-following robot that reliably completes a fixed course, or a simple autonomous plant-watering rover that a housemate would actually rely on.
3. **Slightly harder product** — Add a PID-controlled arm or a self-balancing chassis. Constraint: it now has to survive disturbances (a nudge, an uneven floor, a slightly discharged battery) without falling over or losing track, forcing real tuning rather than a plug-in gain from a tutorial.
4. **Commercial-quality product** — Build a small autonomous vacuum-style robot with obstacle avoidance, a documented BOM under $80, a battery-life spec (measured, not estimated), and a basic safety cutoff (won't drive off a stair edge, motors disable if picked up).
5. **Manufacturable product** — Redesign the chassis as an injection-moldable or sheet-metal part instead of 3D-printed prototype geometry, spec fasteners and bearings to standard catalog parts, define a tolerance stack for the drivetrain, and write an assembly procedure a contract manufacturer could follow without access to the original CAD files' history.
6. **Startup-quality product** — Benchmark against the iRobot Roomba 600-series and a budget Amazon competitor on price, run time, and noise (measured in dB). Identify a defensible niche (e.g., pet-hair performance, a specific room size, a specific price tier) and justify why the design wins there.

### Branching by interest without leaving gaps

Self-direction is a first-class design value here, not a concession to keep students entertained. The operating principle is simple: **learners choose meaningful direction in what they build — the curriculum enforces core competency coverage but does not lock everyone into an identical project sequence.** A student obsessed with audio should be allowed to spend six months doing nothing but audio projects, because motivation compounds when someone is building the thing they actually wanted to build, not the thing that was assigned to them. The risk that creates is a student who builds ten audio amplifiers and never learns power electronics, digital logic, or mechanical design, and ends up with a narrow, brittle skill set behind a portfolio that looks broad.

The fix is separating **project topic** (student's choice) from **skill coverage** (system's responsibility), using the knowledge graph described in doc 02. Every project, regardless of theme, is tagged against the underlying concepts it exercises — Ohm's law, transistor biasing, thermal derating, PID tuning, tolerance stack-up, and so on. The mastery model tracks concept coverage independently of project topic.

Concretely, this means:

- The AI mentor tracks a **coverage map**: which foundational concepts has this student actually demonstrated, versus which ones has their project history simply never touched.
- If a student's last eight projects are all audio and none of them required switching-mode power supplies, digital communication protocols, or thermal design, the mentor doesn't block further audio projects — it *proposes* the next audio project be one that happens to require one of the missing concepts (a battery-powered wireless in-ear monitor forces switching regulators and RF; a Class D amplifier forces switching power stages and thermal design).
- A short list of **foundational projects** exist outside any theme track specifically to guarantee coverage of concepts too fundamental to be theme-optional — basic circuit analysis, basic statics, basic thermodynamics — the same way the brief calls out "foundational projects to build intuition" as its own category, distinct from theme-driven useful products.
- Before a student is certified as having reached a given tier *overall* (as opposed to within one theme), the coverage map must show breadth minimums across the discipline's core topic list (for EE: Circuits, Analog, Digital, Embedded, Control, Power Electronics, PCB Design), not just depth in one theme.

This means a portfolio can legitimately be personality-driven — heavy on audio, or heavy on drones — while the transcript underneath it guarantees the student isn't missing load-bearing fundamentals. Interest drives what gets built; the coverage map, not the student's preferences, decides what "graduated from tier N" certifies.

---

## Part 2: Assessment Philosophy

### What's actually wrong with exams

Exams are not disliked here for being unpleasant. They're disliked because they're a weak proxy for the thing we actually care about, and the proxy fails in specific, diagnosable ways:

1. **Exams measure recall and recognition under artificial time pressure, not design capability.** Knowing that a MOSFET's threshold voltage matters is not the same skill as knowing you need to check it when your gate driver can't fully turn a FET on and your board is running hot. Real engineering failures are rarely "I didn't know the formula." They're "I didn't think to apply it here."

2. **Exams are single-shot and irreversible.** In real engineering, the entire discipline is iteration: you build something, it fails in a specific way, you diagnose why, you fix it, you re-test. An exam gives you one attempt and calls the result a measurement of skill. It measures performance under a condition — no iteration allowed — that essentially never occurs in professional engineering.

3. **Exams reward narrow, well-specified problems.** Real design problems are underspecified — "make this cheaper," "make this more reliable," "customers say it's too loud" — and part of the skill is figuring out what to even solve for. Exam questions are, definitionally, fully specified. This makes exams systematically blind to the skill of framing a problem, which is often the highest-value skill an engineer has.

4. **Exams are easy to prep for in ways disconnected from the underlying skill.** Pattern-matching to problem types, memorizing solution templates — this produces high scores without producing engineers who can debug an unfamiliar board at 11pm. The correlation between exam score and job performance is exactly as strong as the exam's design happens to force real transfer, and most exams don't.

5. **Exams can't assess judgment, communication, or taste** — whether a design is *well* engineered, not just correct; whether documentation is legible to the next person; whether a tradeoff was justified or just guessed at.

**What exams are still good for.** It would be dishonest to claim exams have zero value. They're a cheap, fast, well-calibrated tool for one narrow purpose: checking foundational recall — do you know Ohm's Law, can you compute a Thevenin equivalent, do you know what a datasheet's absolute maximum ratings section means. This is diagnostic, not evaluative. We use short, low-stakes, frequent recall checks (closer to spaced-repetition flashcards than midterms) as a gating mechanism before a student attempts a project that assumes that recall — not as a grade, and never as the primary signal of capability. If a student already demonstrates the concept fluently through project work, the recall check is skipped entirely; it exists to catch gaps, not to re-certify things already proven in practice.

### What evidence looks like

Evidence-based assessment means the mastery model (doc 02) is fed by artifacts generated in the ordinary course of doing the work, not by a separate testing event bolted on afterward. Concretely, the evidence categories are:

- **Project artifacts** — the schematic, the CAD file, the code repo, the BOM, the enclosure files, the test rig. The actual thing built.
- **Design rationale documents** — a short, structured writeup for every non-trivial decision: why this topology, why this component over the cheaper alternative, what was traded away. This is where "explain your reasoning" becomes a persistent artifact rather than a one-time verbal answer.
- **Debugging session logs** — the AI mentor logs the back-and-forth when something doesn't work: what the student measured, what they hypothesized, what they tried, what actually fixed it. This is one of the highest-signal artifacts in the whole system, because debugging is where engineering judgment is most visible and hardest to fake.
- **Code / schematic / CAD review transcripts** — the record of the mentor pointing out an issue and the student's response. Did they understand the critique? Did they push back with a valid counter-argument, or concede and not actually fix anything?
- **Iteration history** — every prior version of the design, diffed against the current one, annotated with what changed and why. The single most important question this answers: *did the student get better after feedback*, or did they get the same critique three projects in a row and ignore it?
- **Peer / community review** — for tier 4+ projects, feedback from other students or, at tier 6, from actual outside users. This also trains the reviewing student — critiquing someone else's tradeoff is itself a mastery signal.
- **Spot debugging challenges** — the mentor periodically hands the student a deliberately broken version of *their own* prior project (a swapped resistor, a sign error in firmware, a mis-toleranced part) and watches them find it live. This is the closest thing to an exam in the whole system, and it's deliberately designed to be un-gameable (see below), because it's their own design and there's no reference solution to copy.

**How the AI mentor aggregates this.** Each artifact maps to one or more nodes in the concept/skill graph from doc 02 and updates a confidence estimate for that node — not a pass/fail, a running probability that the student has genuinely internalized the concept, weighted more heavily toward recent, unaided, and pressure-tested evidence (a spot debug challenge solved unaided outweighs a design rationale doc that could have been written with heavy AI assistance). A tier-completion judgment for a given theme is a function over the coverage map: minimum confidence across the required node set, not an average — a single unaddressed foundational gap should not be washable out by strength elsewhere, the same way a bridge doesn't get credit for nine good welds and one bad one.

### Rigor and anti-gaming

The obvious objection: if AI is mentoring and AI is easy to lean on, what stops a student from having the AI do the engineering and just relaying the answers? A few students will always try. The system needs to make that strategy both hard to execute and low-value even when it succeeds, rather than pretending it can be fully prevented.

This isn't purely a defensive question. The platform's stance is that AI-assisted production work is normal and encouraged — the same way a practicing engineer uses AI copilots for code, CAD, and calculation checking — which makes the question of how to verify real understanding *more* important, not less. If production work is assisted by default, the mastery signal has to come from somewhere else, or it isn't a signal at all. The safeguards below serve both purposes at once: they stop gaming, and they're the concrete mechanism by which the platform delivers on the promise that a demonstrated skill actually means something.

Safeguards, layered:

- **Live design reviews.** At tier boundaries, and periodically within a tier, the student walks the mentor (or a human reviewer, for higher tiers) through their own design live — verbally or via a recorded session — with follow-up questions that a copied design doesn't prepare you for: "why is R14 that value and not half of it," "what happens to this circuit if the input is 20% higher than spec." A student who doesn't understand their own design cannot sustain this for more than a few questions.
- **Iteration history as a requirement, not a nicety.** A polished final schematic with no version history is treated as a red flag, not a clean submission. Real designs have false starts. A submission that appears fully-formed from the first commit is exactly the pattern an AI-generated or copied reference design produces, and it should trigger closer review rather than being rewarded for looking tidy.
- **Mandatory tradeoff justification, checked for internal consistency.** It's easy to copy a value; it's much harder to fabricate a consistent rationale for it under follow-up questioning, especially against numbers the student themselves logged from their own bench testing (a fabricated rationale tends to not match the noisy, imperfect measurements a real prototype actually produced).
- **Spot debugging on their own project**, as above — the reference-design-copying strategy specifically fails here, because there is no reference solution for a bug injected into a specific student's specific design.
- **Escalating unaided sections — the direct implementation of the platform's AI stance.** The platform draws a hard line between production work (AI-assisted, encouraged, same as industry) and mastery checkpoints (periodically unaided) — this is where that line actually gets built into the mechanics, not just stated as a philosophy. Early tiers allow, even encourage, heavy AI assistance during production work — the point at that stage is learning, not gatekeeping. But every tier includes some component explicitly done without AI assistance (a bench debugging session, a live review, a from-scratch derivation), and the *proportion* of unaided work required increases with tier. By tier 5–6, a meaningful fraction of the evaluation is watching the student perform, live, without the tool that might have written their earlier drafts. A student who can do that has the thing that actually matters: the ability to tell when the AI is wrong, not just the ability to prompt it.
- **Cross-referencing artifact timestamps and effort signatures.** A design rationale doc written in four minutes for a project that took three weeks is a signal worth a human or mentor follow-up, not an automatic accusation — but a pattern of it across many projects is treated as evidence requiring a live review before further tier advancement.

None of these makes gaming impossible — no assessment system fully is. But they change the economics: gaming this system requires more sustained effort, understanding, and live improvisation than just doing the work honestly would. That's the actual design goal — not a perfect lie detector, but a system where cheating is harder than learning.

---

## Part 3: Portfolio System

### The unit of the portfolio: a project entry

A degree transcript says "Circuits II: B+." It tells an employer almost nothing. A portfolio entry should tell them almost everything. Each entry is a structured artifact, not a polished blog post, containing:

- **Problem statement** — who is this for, what does it solve, why does it matter. One paragraph, no fluff.
- **Design decisions and tradeoffs** — the key choices made and what was given up for each (cost vs. performance, size vs. battery life, off-the-shelf part vs. custom). This is pulled directly from the design rationale documents generated during the project, not rewritten after the fact for polish.
- **BOM and cost** — actual parts, actual prices, actual total, and how it compares to the target set at the start.
- **Prototypes and iterations** — a visible history: v1 photo/schematic, what was wrong with it, v2, what changed, and so on through the final version. This is the single most differentiating section relative to a typical student portfolio, which usually shows only the final, successful version and hides the process entirely.
- **Test results** — actual measured data: battery life measured on the bench, not estimated from a datasheet; frequency response plotted, not asserted; drop test outcome, not assumed.
- **What they'd improve** — an honest retrospective. A student who can articulate what's still wrong with their own finished project is demonstrating exactly the kind of judgment that "it works" alone doesn't prove.

### Verifiability: why this is trustworthy and not just a nice writeup

A portfolio's value to an outside party — an employer, a collaborator, an admissions committee — depends entirely on whether it can be trusted. A slick writeup with a photo of a finished PCB proves almost nothing on its own; it's indistinguishable from something bought, copied, or produced with undisclosed heavy assistance. The system needs to carry its own provenance.

- **Provenance of work.** Every artifact in a portfolio entry links back to the underlying evidence trail from Part 2 — the actual commit history, the actual mentor review transcript, the actual bench data file with a timestamp. An employer isn't shown a claim; they're shown (with the student's permission) the trail that substantiates it.
- **Mentor-reviewed iteration history, not just a final snapshot.** Because iteration history is a first-class, structurally required part of every entry (not an optional appendix), the portfolio inherently shows the *process* of engineering, not just its output. This is closer to how a strong human reference letter works — "I watched this person debug X" — except it's documented and durable instead of a single person's fading memory.
- **Verified unaided components.** The platform's stance on AI — production work assisted, mastery checkpoints periodically unaided — means every entry has, by construction, both kinds of evidence in it, and the entry says so explicitly instead of presenting a single undifferentiated "I built this." Concretely: the design rationale, CAD, and iteration history are labeled as AI-assisted production work (normal, expected, not a mark against the entry), while the live design review and spot debugging session tied to that same project are labeled as independently verified. An outside evaluator isn't asked to take "I understand this" on faith — they're shown exactly which claims are backed by unaided performance and which reflect ordinary tool use, which is what keeps the credential meaning something more than "knows how to prompt."
- **Consistency across entries as a fraud signal.** A single fabricated entry is possible to fake convincingly. A fabricated *portfolio* — dozens of entries, each with iteration history, bench data, mentor review transcripts, and cross-referenced skill coverage that all has to cohere — is a much higher bar to falsify than any single credential, the same way a long, consistent employment history is harder to fake than one reference.

### Growth over time, not a snapshot

A resume shows where someone ended up. It doesn't show the slope. A portfolio that only displayed finished projects would make the same mistake at larger scale. Instead the portfolio should surface trajectory explicitly:

- **A tier-progression view** — literally the path through the six tiers, per theme, over time, so a viewer can see "started at tier 1 in month 1, was consistently producing tier 4 work by month 14."
- **A response-to-feedback view** — pulled from iteration history and mentor review transcripts: does this person's second draft actually address what a reviewer flagged? Tracked longitudinally, this is arguably a stronger signal of future performance than any single project's quality, because it's a direct measure of coachability and self-correction — exactly what determines whether someone gets better on the job.
- **A breadth/depth map** — the coverage map from Part 1, visualized, showing which disciplines and sub-topics the student has demonstrated mastery in and to what tier, so a viewer isn't stuck inferring breadth from a handful of example projects.
- **Time-stamped everything.** Because the underlying evidence trail is timestamped by construction, "growth" isn't a claim the student makes about themselves — it's directly observable in the data.

### Toward a credential

The long-term claim is not that a portfolio is a nice supplement to a degree. It's that, built this way, a portfolio can function as a credential in its own right — for the specific reason that it directly measures the outcome employers actually care about (can this person design, build, and debug real systems) rather than a proxy for it (did this person sit through and pass a sequence of courses).

For that claim to hold up, the credential has to solve the problem degrees solve today, which is mostly a trust and legibility problem for someone who doesn't have time to evaluate the work directly:

- **Legibility** — an employer skimming a portfolio needs to get a calibrated read in minutes, not hours. This argues for a standardized entry structure (as above) and a summary view — tier reached per discipline, number of tier-4+ projects, iteration/coachability signal — that functions like a transcript, but one backed by inspectable evidence rather than an opaque letter grade.
- **Comparability** — a "tier 5 power electronics project" needs to mean roughly the same thing across students, which is exactly what the constraint-based tier definitions in Part 1 are for: they're specified in terms of what the design had to survive and satisfy, not vague quality adjectives, so a reviewer can check the claim against the artifact.
- **Third-party spot-checking** — because live, unaided design reviews and spot debugging challenges are already built into the assessment pipeline, an employer (or the platform itself, as a service) can re-run an equivalent live check before a hire, exactly the way some employers already do take-home projects or live coding interviews — except here there's a rich prior evidence trail to calibrate against, instead of a single high-stakes hour.
- **Portability and ownership.** The student owns their evidence trail and portfolio outright; it isn't a certificate a school can conditionally revoke or gate behind fees. This matters for the credential functioning as it should — durable, checkable years later, not just at graduation.

None of this requires universities to be wrong about everything they do. It requires this platform to be right about one specific thing: that a verifiable, longitudinal record of real engineering work is a better predictor of engineering capability than a transcript of grades, and that predictor is worth enough to employers and collaborators that it can stand on its own. That's a falsifiable bet, and the entire assessment and portfolio system above is built to make it checkable — by the student, by a mentor, and eventually by anyone deciding whether to trust this person with a hard engineering problem.
