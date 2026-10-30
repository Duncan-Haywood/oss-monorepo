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

## What a run does

1. **Advance an open programme by default.** Pick one from the table below
   (`python3 research/_shared/pick_track.py` draws one). Read its `PROPOSAL.md`
   and the newest entries of its `LOG.md`, take the next milestone or the most
   pressing open problem, and land one real step: a result, a proof, a
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

| Programme | Question | Builds on | Target venue |
|---|---|---|---|
| [`sim2real-inference`](sim2real-inference/PROPOSAL.md) | How few real trials certify a robot policy when a biased simulator supplies the rest, with guarantees that hold whatever the bias? | ~130 `*-twin`, `twin-*` and `mimic-twin*` projects | CoRL / RSS (robotics), or a statistics venue for the theory |
| [`verifiable-training-mechanisms`](verifiable-training-mechanisms/PROPOSAL.md) | Can outsourced ML training be made incentive-compatible to verify, with scoring rules, audits and peer prediction combined into one protocol that comes with proofs? | ~60 scoring, elicitation, audit, market and verifier projects (`themes`: scoring, effort, games, markets) | ACM EC / AAMAS |
| [`lowcomm-training`](lowcomm-training/PROPOSAL.md) | A predictive theory of low-communication training (DiLoCo-style local SGD): which of sync interval, compression, delay, momentum and robust aggregation set the final loss, checked on real small-transformer training | the `*-outer`, `*-sync`, `local-sgd-*` and `replay-*` projects | ICML / NeurIPS workshop, then main track |
| [`verified-dse`](verified-dse/PROPOSAL.md) | Multi-fidelity, verification-aware design-space search for open-source chip flows: cheap rungs plus predicted formal equivalence, scored on real SKY130 place-and-route | `eda-*`, `chip-*` and `accel-*` | MLCAD / ICCAD |
| [`llm-coding-inference`](llm-coding-inference/PROPOSAL.md) | Valid downstream inference from LLM-coded qualitative data under group shift and rare categories, on real annotated corpora | `qual-*` | a computational social science methods venue (e.g. *Sociological Methods & Research*) |
| [`aerolog-scaling`](aerolog-scaling/PROPOSAL.md) | What does a 1:N Froude-scaled model of a cargo UAV reproduce of the 1:1 aircraft, and where does it lie (Reynolds-driven drag and stall, powertrain, energy)? | `osrobot-uav`, `codesign-aero`, `uav-energy-twin`, track 22 | AIAA SciTech / *Journal of Aircraft* |
| [`marine-hull`](marine-hull/PROPOSAL.md) | Which body (monohull, catamaran, SWATH, hydrofoil, glider, AUV) carries a survey payload furthest per kWh, and where does the ranking flip under uncertain drag inputs? | track 23; `osrobot-*`, `codesign-*` | OCEANS (IEEE/MTS) / *Ocean Engineering* |
| [`heavy-hydraulics`](heavy-hydraulics/PROPOSAL.md) | Which buildable hydraulic circuit (open-centre, load-sensing, independent metering) gets a small excavator closest to stock energy use for the least parts cost? | track 25; `osrobot-*`, `codesign-*` | Int. J. Fluid Power / Bath-ASME fluid power symposium |

A row without a proposal is an invitation: its first session writes the
proposal. Add rows when a question earns one; close a row (with a line on the
outcome) when its paper is ready or the question is settled.
