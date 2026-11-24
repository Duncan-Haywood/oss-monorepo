---
title: "Spending a 1% risk budget on force-sensor re-zeros: the optimal schedule barely beats one risk level"
date: 2026-11-24
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, calibration, optimisation]
seo_title: "Optimal force-sensor re-zero schedules under random-walk drift"
description: "An exact risk calculation and a dynamic programme find the fewest re-zeros at 1% wall risk. One calibrated risk level is within 7% of it."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can nail sheathing onto a wall with every press inside 0.03 mm. [Milestone 73](2026-11-23-sheathing-robot-force-sensor-random-walk-drift.md) found that if the wrist force sensor's bias random-walks, a re-zero plan has to be built from risk, not from a drift rate. It gave every press the same risk limit and tuned that limit by simulation until 1% of walls failed. On the G1 it hit a cliff: either one re-zero every sheet with no failures, or a third fewer re-zeros and 11% of walls failing. Nothing in between.

Milestone 74 asks whether a cleverer split of the 1% budget gets past that cliff. Some poses are weaker than others, so perhaps they deserve more of the risk.

**Computing the risk exactly.** A simulation with 4,000 walls estimates a 1% failure only to about ±0.16 points. That is too coarse to tune a schedule against. Under a random walk, though, only the *size* of the bias matters, and that size on its own behaves as a Markov chain (a 3-D Bessel process, for the mathematically inclined). The chance that a run of presses all stay inside their limits can then be computed exactly. Push the probability distribution of the bias size from one press to the next with a closed-form step, and remove whatever lands outside each press's limit. A re-zero resets the walk, so the wall's risk is a product over the stretches between re-zeros. The fewest re-zeros at 1% risk becomes a dynamic programme over the 6,200 presses of a 100-sheet wall.

**The test.** Seven hypotheses were registered in the [log](../../research/buildbot-sheathing/LOG.md) before the run. The test covered 18 cases: three lift plans, two robots (Unitree G1 and H1), and three drift sizes. Five held.

- **The calculation checks out.** It agrees with milestone 73's simulations within their noise on all 18 cases. A grid twice as fine moves the optimum by at most one re-zero. The optimal schedules fail at most 1.2% of 4,000 fresh simulated walls.
- **The cliff is real.** On the G1 at 0.1 N of drift an hour, the best possible schedule needs 96 re-zeros per 100 sheets, against 99. The weak 1.2 m pose's deadline sits just under the 116 s it takes to hang a sheet. Sharing risk differently cannot change that.
- **Splitting the risk hardly pays.** The registered guess was a 15% median saving. The real median was 1%. Compare against one risk level tuned with the exact calculation instead of simulation, and the optimum ties it on 12 of 18 cases. On the rest it saves at most 7% (142 against 149 re-zeros at worst). A two-level split by pose did no better.
- **The old calibration overshot.** Five of milestone 73's 18 tuned schedules really fail more than 1% of walls, up to 1.31%. The tuning used 4,000 simulated walls, and at a 1% target that noise is enough to miss. The H1 needs 10 re-zeros at 0.1 N of drift, not the 9 milestone 73 reported.

![Re-zeros per 100 sheets at 1% wall risk: the optimal schedule against one per-press risk level, three lift plans, G1 and H1](../../research/buildbot-sheathing/experiments/m74_riskopt/figure.png)

**What a practitioner should take from it.** You do not need an optimiser for this. Give every press the same risk limit, but tune that limit with an exact risk calculation, not a few thousand simulated walls. That lands within 7% of the best schedule there is. The count is set by the lift plan's weakest pose. On the G1, starting the lift bands at the bottom of the grip range (milestone 72) is still worth far more than any risk accounting: 23 re-zeros instead of 96, 2.97% of the sheet cycle at 15 s a re-zero.

**What it does not show.** Only a pure random walk was tested. A drift with a steady trend breaks the one-variable chain. The drift size is swept, not sourced: vendor and arXiv hosts were refused from the build machine again. The schedules are fixed in advance; a robot that reads its idle bias at each lift stop and re-zeros only when needed could do better, and that is the next step. Statics only.

Code, results and the post-hoc comparison are in [`experiments/m74_riskopt/`](../../research/buildbot-sheathing/experiments/m74_riskopt), and the method in [`riskdp.py`](../../research/buildbot-sheathing/src/buildbot_sheathing/riskdp.py).
