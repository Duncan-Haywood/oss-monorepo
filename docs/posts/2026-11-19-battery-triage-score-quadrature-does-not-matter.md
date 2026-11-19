---
title: "Trapezoid or solver state: refitting a battery triage policy on its own scorer changed nothing"
seo_title: "PyBaMM triage: state-read plating changes no decision"
date: 2026-11-19
tags: [research, batteries, pybamm, simulation, reproducibility]
description: "We refit the cell-fidelity triage policy on 200 designs with plating read from PyBaMM's state, not a trapezoid. All 64 held-out decisions and the headline held."
---

The [cell-fidelity](../../research/cell-fidelity/) programme has a rule for
battery design searches that use PyBaMM's full DFN model. Simulate every design
for ten cycles, score how far its lithium-loss trend will drift, and run only
the risky designs on to cycle 50. The last step made the runner's score cheap
to compute. It stopped integrating the plating current over every output step
and read the change in the dead-lithium state instead: two state vectors per
cycle, which gives the solver's own exact integral. That cut the read from
0.20 s to 9 ms.

One loose end was left. The policy's correction lines and thresholds had been
fitted on observables computed the old way, with the trapezoid rule. So the
shipped tool paired one scorer with tuning made for another. On one design the
two scores differed by 0.2%. That was small, but it was untested everywhere
else.

## What we ran

We re-ran the first ten DFN cycles of all 200 designs the policy and its
evaluation had ever used, across five pools and four parameter sets. From each
solution we read the three observables both ways. Then we refit everything
built on top of them on the state read:

- the per-set drift correction;
- the threshold, with its nested margin;
- the leave-one-pool-out evaluation (lopo5), the paper's headline.

The cycle-50 errors that decide whether a policy "meets" its target come from
the original 100-cycle runs and do not change. The hypotheses were written down
before the bench ran ([LOG](../../research/cell-fidelity/LOG.md), 7o plan).

## What came out

- **The correction barely moved.** Each set kept the same observable. The
  drift estimate moved by a median 1.2 × 10⁻⁵ and at most 3.2 × 10⁻⁴. One
  observable, the shift of the plating centroid between cycles 2 and 10, moved
  by up to 18%, because it is a small difference of two numbers. Its effect on
  the score stayed in the fifth decimal.
- **Every held-out decision was the same.** On the 64 designs of the 7h pool
  the state-refit policy stopped or extended exactly the designs the old one
  did, including the two within 1% of the threshold. The same three of four
  parameter sets met the accuracy target.
- **The headline held.** lopo5 met 19 of 20 folds at 43.5 DFN cycles per
  design, a 13% saving, the same under both reads.

One check failed, and we report it. The two newest pools reproduced their
recorded observables bit for bit. The three oldest did not quite. Their
lithium-loss bend differed by up to 1.4% on five designs, more than the
pre-registered 0.1% bar, so that hypothesis is marked refuted. Our guess is
that those pools were first simulated as 100-cycle experiments, so the solver's
adaptive steps differ from a ten-cycle run; we did not test that. It changes
nothing downstream. The old observables, fed through the same code, reproduce
the published numbers exactly, and so does this bench's own trapezoid read.

## Why it matters

How the plating integral is computed is not something the result depends on.
The runner can now ship with a policy fitted on the read it actually uses:
[`experiments/state7o/triage.py`](../../research/cell-fidelity/experiments/state7o/triage.py),
with policy `deploy_state` fitted on all five pools. The open problem for the
paper is breadth. With four parameter sets, the across-chemistry interval
still spans zero, so the next step adds a fifth and a sixth, benched through
this runner.

Numbers: [`results.txt`](../../research/cell-fidelity/experiments/state7o/results.txt).
