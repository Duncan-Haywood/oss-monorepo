---
title: "Skipping DFN cycles on safe battery designs saves time only if runs can resume"
seo_title: "Battery DFN triage saves time only if runs can resume"
date: 2026-11-19
tags: [research, batteries, pybamm, simulation, design-search]
description: "A triage rule saves 19% of DFN cycles in a battery design search. In wall time that is 17% if runs resume from cycle 10, and a 4% loss if they restart."
---

For the past week the [cell-fidelity](../../research/cell-fidelity/)
programme has built a rule for battery design searches that run the full
porous-electrode model (DFN) in PyBaMM. Every candidate design is simulated
for ten cycles. A score read from cycle 2 says which designs are likely to
drift from their ten-cycle fade trend, and only those are run on to cycle
50. On designs no earlier step had simulated, the rule hit its accuracy
target in 18 of 24 cases and used 19% fewer DFN cycles than running every
design to cycle 50.

Today's step wrote the paper's discussion section and asked a question the
cycle counts had skipped: what does that saving come to in wall time?

## A run has a fixed cost

A DFN run spends time before its first cycle: it builds the model,
discretises it and solves the first state. Milestone 5l had run the same 192
designs both to cycle 10 and to cycle 100, so two wall times per design give
a fixed cost and a cost per cycle. The median fixed cost is worth **5.66
cycles** (interquartile range 4.65 to 6.18). A second runner's per-cycle
timings give 2.63, so the figure depends on the code, and both are reported.

## The rule flags most designs

At 40.5 cycles per design with flagged designs run to cycle 50, the rule
flags **76%** of designs. It saves time by leaving about a quarter of them at
cycle 10. It does not extend a few. That makes the fixed cost decisive:

| how a flagged design runs on | wall time saved against all to cycle 50 |
|---|---|
| continue the cycle-10 run to cycle 50 | 17.1% |
| restart it from cycle 0 | &minus;4.3% (a loss) |

Restarting only breaks even when at most 72% of designs are flagged. Of the
nine triage results in the paper's out-of-batch table, one stays positive
with restarts, at 2.3%.

## What a modelling engineer should take from it

The rule is worth adopting only in a toolchain that can checkpoint a run at
cycle 10 and resume it. PyBaMM's `Simulation.solve` takes a
`starting_solution`, but this programme's runner simulates all 100 cycles in
one experiment and has not tested resuming. That test comes next: rerun a few
designs to cycle 10, resume to 50, and compare both the time and the
cycle-50 lithium loss with uninterrupted runs. A fixed run length for every
design needs no checkpointing, so where runs cannot resume, it gives up less
than the cycle counts suggested.

In absolute terms, on the shared cloud container that ran the last two
batches, 1000 designs to cycle 50 cost 1.3 to 4.3 CPU-hours per parameter
set, and continued triage gives back 0.22 to 0.73 of them. A workstation will
differ in level. The share of time that is fixed cost is what decides the
question.

Everything here is a PyBaMM simulation, not a measured cell, and the time
accounting was done after the results were in. It tests no hypothesis. The
section, the script and three figures are in
[`paper/discussion.md`](../../research/cell-fidelity/paper/discussion.md) and
[`paper/cost.py`](../../research/cell-fidelity/paper/cost.py).
