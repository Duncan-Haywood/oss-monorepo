# Research programmes: the PhD-level bar

Set by the owner on 2026-10-24: "I want the research we do to be bumped to
hopefully being phd + in ambition and scope. deeper projects and research.
publishable. doing step by step is still okay but the full scope is look at
deeper harder more impactful problems", and "I think increase the requirements
for it will be beneficial."

**Why.** By 2026-10-24 `research/` held 1,043 project directories. The median
one is 296 lines of Python (90% are under 485, and 2 pass 2,000), only 2 kept a research log, and
whole clusters ask one question many times: about 130 `*-twin`/`twin-*`
projects each price one way a biased simulator misleads, and over 20
`simdesign-*` projects probe the mesh behaviour of one laser-cut bracket. Each
step was honest, but few would stand alone as a thesis chapter, and the
portfolio's stated aim is work a faculty member takes seriously
(`prompts/research/`, Mission). So the unit of research is now the
**programme**: one hard, open question, pursued over many sessions until it
yields a paper that could go to a named peer-reviewed venue.

**PhD+, aimed at deep tech** (owner, 2026-11-01: "move the research into
phd+ level with applications in deep tech applications"). The bar below is
the floor. Aim past it: theory checked on real measurements or industrial-grade
open tools, an artefact a practitioner adopts, and an application in chips,
robotics and autonomy, sensing, energy, construction or heavy equipment that
the proposal names.

## What a run does

1. **Advance an open programme by default.** Pick one from the table below
   (`python3 research/_shared/pick_track.py` draws one). Read its `PROPOSAL.md`
   and the newest entries of its `LOG.md` (`python3 research/_shared/research_log.py
   latest <slug> -n 3`; `labels <slug> --ref origin/main --prs` gives the next free milestone
   label and hypothesis number, counting open PRs as well as main), take the next milestone or the most pressing open problem, and land one real step: a result, a proof, a
   stronger baseline, a real-data validation, a section of the paper. Steps can
   be small; the question they serve is not.
2. **Or open a new programme**, when the draw says so, or when a question you
   can defend as more important turns up. Write `research/<slug>/PROPOSAL.md`
   to the bar below and add a row to the table. A good proposal is a full
   session's work in itself, and it counts as one.
3. **Steps live inside the programme.** A step adds to the programme's
   directory (`experiments/<step>/`, `paper/`, `LOG.md`). It does not get a new
   `research/<slug>/`. A real sub-study that needs its own directory names its
   programme in `project.json` (`"programme": "<slug>"`).
   `research/_shared/programme_check.py` (run by research CI) enforces this for
   directories created after 2026-10-24. A standalone project that is worth it
   anyway (a tool, a dataset, a replication) says so in its `project.json`:
   `"programme": "none", "why_standalone": "<reason>"`.
4. **Write the log before the result.** Record the hypothesis and the planned
   analysis in `LOG.md` before you run the experiment, then the outcome,
   including when it went against you. Negative results that close off a
   branch are progress; log them.

## The bar a proposal meets

`PROPOSAL.md` has these sections (the check looks for the headings):

- **Question.** One sentence, and why it is open.
- **Why it matters.** Who would use the answer, and what changes if we get it.
- **Related work.** At least ten works, read and checked
  (`research/_shared/cite_check.py`), grouped by approach, each with one line on
  what it does and does not settle. Start with the strongest recent work, not
  whatever is easiest to cite.
- **Gap.** What is new here, stated narrowly enough to be checked against the
  related work. Our own earlier projects count as prior work and get cited too.
- **Hypotheses.** Falsifiable, with the result that would refute each one.
- **Method.** Theory (what we try to prove) and experiments: real simulators,
  real datasets or real hardware data where they exist (`research/CLAUDE.md`,
  "Run the numbers").
- **Evaluation.** The state-of-the-art baselines from the literature (not only
  random search), the metrics, seeds and confidence intervals, and the
  ablations.
- **Milestones.** An ordered plan across sessions, each step landable on its
  own.
- **Target venue.** A named conference, journal or workshop, and the
  submission shape (page limit, artefact track). This is an aim, not a claim
  that the work will be accepted.
- **Deep-tech application** (since 2026-11-01; asked for, not yet checked by
  `programme_check.py`, so the nine older proposals still pass). The system
  the answer is for (a chip flow, a robot, a sensor rig, a grid, a building
  site, a machine), the number it moves, who would act on it, and what it would
  take to try it on the real thing. Prefer a main-track venue or the
  application field's own journal over a workshop.

## The bar a programme reaches before it is done

A programme is done when its paper is ready to submit. In practice that means:
a novelty claim that survives the related work; theory or experiments at the
level of a typical accepted paper at the target venue; state-of-the-art
baselines run on equal budgets; results on real data or a widely used
benchmark, not only a model we wrote; statistics a reviewer accepts (seeds,
intervals, effect sizes, the tests named); a reproducible artefact (one command
per figure); and `paper/` drafted in the venue's format. Submitting is an
owner step (it publishes under a name), so finish at "ready to submit" and list
it under "Owner steps".

The research guardrails (`prompts/goals.md`) bind every step: never fabricate,
cite and check everything, state that AI assisted, imply no affiliation. A
higher bar is no reason to overstate. Where a programme falls short of the
venue, the paper says so.

## Open programmes

| Programme | Question | Builds on | Triage (2026-11-24) | Product, or why | Target venue |
|---|---|---|---|---|---|
| [`sim2real-inference`](sim2real-inference/PROPOSAL.md) | How few real trials certify a robot policy when a biased simulator supplies the rest, with guarantees that hold whatever the bias? | ~130 `*-twin`, `twin-*` and `mimic-twin*` projects | `wound-down` | No SMB product; already BLOCKED on real-robot trials (owner step). The paper draft stays public as is. | CoRL / RSS (robotics), or a statistics venue for the theory |
| [`verifiable-training-mechanisms`](verifiable-training-mechanisms/PROPOSAL.md) | Can outsourced ML training be made incentive-compatible to verify, with scoring rules, audits and peer prediction combined into one protocol that comes with proofs? | ~60 scoring, elicitation, audit, market and verifier projects (`themes`: scoring, effort, games, markets) | `wound-down` | No product a customer here would buy (ML-training verification protocols); 92 milestones without a buyer. Draft stays public. | ACM EC / AAMAS |
| [`lowcomm-training`](lowcomm-training/PROPOSAL.md) | A predictive theory of low-communication training (DiLoCo-style local SGD): which of sync interval, compression, delay, momentum and robust aggregation set the final loss, checked on real small-transformer training | the `*-outer`, `*-sync`, `local-sgd-*` and `replay-*` projects | `wound-down` | No SMB product; low-communication LLM training is a lab question, not a bet. | ICML / NeurIPS workshop, then main track |
| [`verified-dse`](verified-dse/PROPOSAL.md) | Multi-fidelity, verification-aware design-space search for open-source chip flows: cheap rungs plus predicted formal equivalence, scored on real SKY130 place-and-route | `eda-*`, `chip-*` and `accel-*` | `wound-down` | Open-source chip-flow search has no SMB customer in `bets.md`; the most mature draft (`paper/main.pdf`) stays public. Reopen only if the owner picks a chip product. | MLCAD / ICCAD |
| [`llm-coding-inference`](llm-coding-inference/PROPOSAL.md) | Valid downstream inference from LLM-coded qualitative data under group shift and rare categories, on real annotated corpora | `qual-*` | `product-linked` | Candidate research-derived product, LLM qualitative coding with valid prevalence intervals (`bets.md` 'not now', scored 20; buyers: research and UX agencies, market-research shops). The audit-size rule and rare-count fallback are the claims that product could make. Effort goes to closing the paper, which is the product's evidence, not to more coverage cells. | a computational social science methods venue (e.g. *Sociological Methods & Research*) |
| [`aerolog-scaling`](aerolog-scaling/PROPOSAL.md) | What does a 1:N Froude-scaled model of a cargo UAV reproduce of the 1:1 aircraft, and where does it lie (Reynolds-driven drag and stall, powertrain, energy)? | `osrobot-uav`, `codesign-aero`, `uav-energy-twin`, track 22 | `wound-down` | Cargo-UAV scaling has no SMB buyer and recent milestones drifted to Remote ID airspace layers; not in the hardware track's named prefixes. | AIAA SciTech / *Journal of Aircraft* |
| [`marine-hull`](marine-hull/PROPOSAL.md) | Which body (monohull, catamaran, SWATH, hydrofoil, glider, AUV) carries a survey payload furthest per kWh, and where does the ranking flip under uncertain drag inputs? | track 23; `osrobot-*`, `codesign-*` | `finish-paper` | Hardware-company track (`marine-*`), no SMB customer. Paper draft (`paper/main.tex`, IEEE format, 8 pages, `check_numbers.py` ok) is far along; section 2.7's ERA5-driven rules are in `paper/DRAFT.md` (6zzu). Remaining (2026-11-24, 7zzf): the L/B 10 added-resistance shortfall is now narrowed to pitch at forward speed (heave matches Journée's Wigley III tables), data-bound; a slender keel-less resistance curve below Fn 0.3; submission formatting. No new questions. | OCEANS (IEEE/MTS) / *Ocean Engineering* |
| [`heavy-hydraulics`](heavy-hydraulics/PROPOSAL.md) | Which buildable hydraulic circuit (open-centre, load-sensing, independent metering) gets a small excavator closest to stock energy use for the least parts cost? | track 25; `osrobot-*`, `codesign-*` | `product-linked` | Hardware-company track (`heavy-*`, open compact excavator): which circuit to build and its parts cost and payback. Manuscript and supplement exist; remaining: the energy-recovery rung (milestone 5) only if the paper needs it, then venue formatting. | Int. J. Fluid Power / Bath-ASME fluid power symposium |
| [`build-data`](build-data/PROPOSAL.md) | Do public building-permit records, loaded from several cities onto one open schema, predict how long a permit and the build behind it take better than each city's own averages, and which fields carry the signal? (the first table of the construction data warehouse; owner, 2026-10-31) | the city open-data permit feeds (Chicago, New York DOB, San Francisco, Austin and others, licences checked per city); `ventures/wall-framing-takeoff`; tracks 12 and 20 | `product-linked` | Bet #1 contractor suite (and #6 takeoff): a permit-wait and build-time prior per city and permit type goes into the suite's job schedule and bid dates. Permit prediction sold alone is a 'not now' bet (14), so the result ships as a suite feature, not a product. | *Automation in Construction* / ASCE *J. Construction Engineering and Management* |
| [`catholic-demography`](catholic-demography/PROPOSAL.md) | How do US (then European and Latin American) Catholic subpopulations differ in fertility, retention, practice and politics, and how much of the change in American Catholicism since 1972 does each demographic channel (retention, switching, fertility, immigration, ageing) account for? (owner's request, 2026-11-03; social science, outside the deep-tech focus) | `religion-origins`, `marriage-divorce-evidence` (GSS pipeline) | `wound-down` | Owner's personal request (2026-11-03), no product case. No new effort unless the owner asks again; flagged in the report as theirs to override. | *Journal for the Scientific Study of Religion* / *Sociology of Religion*; *Demographic Research* for the accounting |
| [`christian-belief-models`](christian-belief-models/PROPOSAL.md) | From the answers a Christian survey respondent gave, how well can models predict the beliefs on marriage and sexuality, teaching adherence, devotion and marriage outcomes they were not asked, and do those associations transfer across Catholic, Protestant and Orthodox subcultures, decades, immigrant generations and countries? (owner's request, 2026-11-03) | `marriage-divorce-evidence`, `religion-origins`, `catholic-demography` (PR #12893); GSS 1972–2024, later EVS/WVS, ISSP, Pew | `wound-down` | Owner's personal request (2026-11-03), no product case. No new effort unless the owner asks again; flagged in the report. | *Journal for the Scientific Study of Religion* / *Sociological Methods & Research* |
| [`theism-formal-evidence`](theism-formal-evidence/PROPOSAL.md) | Once the arguments for and against God, and between Catholicism and Orthodoxy, are machine-checked (Python decision procedure, Lean 4) and the evidence is one sourced Bayes-factor ledger, which premises and which numbers does each conclusion depend on, and how short is that list? (owner's request, 2026-11-07; outside the deep-tech focus) | `christian-belief-models`, `catholic-demography`, `religion-origins` | `wound-down` | Owner's personal request (2026-11-07), no product case. No new effort unless the owner asks again; flagged in the report. | *Religious Studies* / *International Journal for Philosophy of Religion* |
| [`hanger-codesign`](hanger-codesign/PROPOSAL.md) | How much cloth-simulator fidelity and measured fabric data does a laundry robot's hanger design loop need before the hanger it picks is still the best one on a validated, calibrated solver? | track 18, the 25 `hanger-*` projects (`hanger-fit`, `hanger-3d`, `hanger-kes`) | `wound-down` | Laundry-robot hanger design has no SMB customer or bet. | *IEEE RA-L* (robotics); *Textile Research Journal* for the calibration side |
| [`cell-fidelity`](cell-fidelity/PROPOSAL.md) | When does a lithium-ion electrode design search mis-trust a reduced model (SPM, SPMe) against the full DFN model, can the cheap model flag it from its own solution, and how much DFN budget does a fidelity-aware search save? | track 16, `energy-cell`, `energy-cell-dfn` | `wound-down` | Battery electrode design search: no SMB product in `bets.md`; its tables stay public. | *J. Power Sources* / *J. Electrochem. Soc.* |
| [`sensing-selfcal`](sensing-selfcal/PROPOSAL.md) | When a robot camera recalibrates from the features it tracks, with no target, how close does it get to a target calibration, and is the solver's own uncertainty honest enough to accept or reject the update? | track 15, the `sensing-ba*` projects, `sensing-calibviews` | `product-linked` | Construction robotics: the camera on a site robot (`buildbot-sheathing`, stud finding) has to recalibrate without a target; the accept/reject test is the part a robot ships with. Draft and RA-L short version exist; finish them in preference to new OpenCV internals. | *IEEE RA-L* |
| [`buildbot-sheathing`](buildbot-sheathing/PROPOSAL.md) | Can a robot (stock humanoid, mobile manipulator with a lift, gantry) hang and nail wall sheathing so every fastener lands in its window, at a lower cost per clean sheet than a crew, and which error source decides it? | track 20, the 26 `buildbot-*` projects (`buildbot-fasten`, `buildbot-studfind`, `buildbot-cohold`) | `product-linked` | Construction robotics, the long-term hardware-company track (`buildbot-*`): the cost per clean sheet and the error source that decides it set whether a sheathing robot is worth building. The draft paper is the track's credibility; remaining paper steps: the dynamic hand-off (milestone 3), measured stud profiles, venue formatting. | *Automation in Construction*; ISARC as fallback |
| [`codesign-cant`](codesign-cant/PROPOSAL.md) | When does a fixed rotor cant pay on a small quadrotor once arm, propeller, motor headroom and controller are co-designed with it, and does the optimum hold on a full-allocation simulator and measured component data? | track 14, the seven `codesign-aero-cant*` projects | `wound-down` | Quadrotor rotor cant: no SMB product, and not one of the hardware track's named prefixes. | *IEEE RA-L* (ICRA option); ICUAS fallback |
| [`water-leaks`](water-leaks/PROPOSAL.md) | On the BattLeDIM L-Town benchmark, how much of a leak detector's score beats random alarms, and can a data-driven detector carry a false-alarm rate fixed in advance while still finding and roughly localising the leaks? | track 21, `infra-waterloss`, `infra-leakpdd`, `changepoint-detector` | `wound-down` | Water-utility leak detection: utilities are not the SMB buyers the bets name and no bet uses it. | *J. Water Resour. Plann. Manage.* (ASCE); *Water Research* |
| [`grid-linopf`](grid-linopf/PROPOSAL.md) | On binding-limit transmission benchmarks, how often is a linear OPF's dispatch AC-infeasible, and how many AC power flows does a repair need to make it feasible at the AC optimum's cost, with rules frozen on one set and scored on held-out sets? | track 21, `infra-dcopf`, `infra-n1screen`, `infra-hosting` | `wound-down` | Transmission OPF repair: utility and ISO buyers, no SMB product. | *IEEE Transactions on Power Systems*; PSCC fallback |
| [`society-lanes`](society-lanes/PROPOSAL.md) | Which passing policy should a mobile-robot fleet use in a two-way corridor to keep the lanes people form, judged by crowd models fitted to real bidirectional trajectories (Jülich HERMES, BaSiGo) and cross-checked across model families? | track 17, the 31 `society-*` projects (`society-plaza`, `society-twinfidelity`, `society-sidefit`) | `wound-down` | Robot-fleet passing policies in corridors: no product or bet. | *IEEE RA-L* (ICRA option); *Transportation Research Part C* fallback |
| [`capture-sync`](capture-sync/PROPOSAL.md) | How often does a short window of sound sync free-running cameras and phones to within a video frame on real devices, rooms and clocks, and can a confidence set in one room or rig keep its failure rate in another? | track 13, the 18 `capture-*sync*` and `capture-*audio*` projects (`capture-realaudio`, `capture-syncgate`, `capture-reverbsync`); LibriWASN (real phones, CC BY 4.0) | `wound-down` | Multicam audio sync is a 'not now' bet in `bets.md` (15). | *IEEE Signal Processing Letters* / ICASSP; *IEEE/ACM TASLP* for the full study |
| [`civ-seeding`](civ-seeding/PROPOSAL.md) | On the 43 Banerjee et al. (2013) village networks, can cross-sectional adoption data tell a simple from a complex contagion, and which seeding rule stays near the best under every model the data cannot reject? (track 24; a curiosity track, application: rollouts of energy and farm technology) | track 24, `civ-levers` (seeding a complex contagion on synthetic graphs); BCDJ replication data (CC0) | `wound-down` | Curiosity track; technology-rollout seeding has no SMB product. | Proc. ACM EC; *Network Science* |
| [`agent-defects`](agent-defects/PROPOSAL.md) | In a repository written and merged end to end by coding agents, do the repository-mining signals of defective work (SZZ fix links, 14-day follow-ups and line survival, reverts, red CI) flag the changes an independent rubric audit later finds defective, and which process choices predict those defects? (track 10; the repository studying itself, user's direction 2026-11-23) | track 10, the 40 `swe-*` projects, `prompts/derive.py`, the quality audits in `portfolio/quality/` | `wound-down` | AI-code quality analytics is a 'not now' bet (16, slow buyers); what it finds about this repository's process belongs in platform work, not a research programme. | MSR technical track; *Empirical Software Engineering* |

**Triage (2026-11-24).** The owner: "research work gets pivoted into products" and "we don't
invest dev effort in sunken ships" (`research/CLAUDE.md`; the bets are in
`portfolio/monetization/bets.md`). Each row carries one of three states:
`product-linked` (the result changes a named bet or a credible SMB product, or the
open-hardware company track), `finish-paper` (close to a paper that lends a chosen product
credibility; only the named remaining steps, no new questions) or `wound-down` (no new
effort; its directory, log and drafts stay public as they are). `pick_track.py` draws only
`product-linked` and `finish-paper` rows, and puts the construction and manufacturing ones
(`FOCUS`, `FOCUS_PROGRAMMES`) first three times in four. A track draw that names a
wound-down programme opens a new, product-linked one instead. Reasons and evidence:
`docs/reports/2026-11-24-research-triage.md`. To move a row, change its state here with a
one-line reason in the same PR. New programmes name the product and customer
(`research/CLAUDE.md`) and start `product-linked`.

A programme whose open items all wait on outside data or an owner step gets a one-line `research/<slug>/BLOCKED` file; `pick_track.py` then skips it (delete the file when work is doable again). A programme whose next steps need a data host that the session proxy sometimes refuses lists those URLs in `research/<slug>/HOSTS`; `pick_track.py` probes them and passes the programme over in a session where one does not answer (`research/build-data/HOSTS` is the example). A row without a proposal is an invitation: its first session writes the
proposal. Add rows when a question earns one; close a row (with a line on the
outcome) when its paper is ready or the question is settled.
