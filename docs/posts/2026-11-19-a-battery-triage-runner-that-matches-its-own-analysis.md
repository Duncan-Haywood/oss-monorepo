---
title: "A battery simulation triage runner that matches its own analysis, and what it saves"
seo_title: "A PyBaMM triage runner: same decisions, 14% less wall time"
date: 2026-11-19
tags: [research, batteries, pybamm, simulation, design-search]
description: "The cell-fidelity triage rule, built as a one-process-per-design PyBaMM runner, matched the analysis on 64 of 64 held-out designs and saved 14% of wall time."
---

For a week the [cell-fidelity](../../research/cell-fidelity/) programme has
built a rule for battery design searches that use the full porous-electrode
model (DFN) in PyBaMM. Simulate every design for ten cycles, read a drift
score from its plating, and run only the risky ones on to cycle 50. Until
today the rule existed as analysis over runs that had already gone to cycle
100. The previous step showed that one live PyBaMM `Simulation` can be extended
in place at no extra fixed cost. So today's step built the runner itself and
checked it against the analysis.

## The tool

[`triage.py`](../../research/cell-fidelity/experiments/runner7m/triage.py)
takes one design and a frozen policy file. It:

1. builds the DFN model with SEI growth and lithium plating;
2. solves ten cycles;
3. reads the plating at each node of the negative electrode at cycles 2 and 10;
4. turns that into the drift score;
5. stops, or calls `solve` on the same object until cycle 50.

Nothing goes to disk. Each design decides by itself, because the threshold is
absolute and needs no batch to rank against.

## The check

The 7h pool has 64 designs, 16 on each of four PyBaMM parameter sets. Their
scores and decisions were already known offline, and the policy was picked
on four earlier pools that did not include them. The runner's scores matched
the offline ones to a relative 3 × 10⁻¹³. Its stop or extend call agreed on
all 64 designs, including the two within 1% of the threshold. The lithium
loss it reported matched the original runs exactly, so the accuracy measured
in 7h carries over unchanged: the policy met its tail-error target on three
of the four parameter sets and missed on `Chen2020`.

## What it saves

Each design also ran once as a plain 50-cycle simulation. On average, a design
under the runner took 0.860 times as long, a **14.0%** wall-time saving. The
cycle model had predicted 0.819. Weighted by run time the saving is 9.7%,
because the designs it stops early are the cheap ones. Most of the gap from the
headline 19% cycle saving has three causes:

- every design pays a fixed cost of about five cycles to build the model;
- 75% of this pool was flagged for the full 50 cycles;
- reading the score took a median 0.2 s, about 1.3 cycles' worth. The plan
  had allowed half a cycle, so that hypothesis came out inconclusive.

The saving is uneven by chemistry: 27.5% on `Chen2020`, 5.7% to 15.9% on the
other three. The largest saving came on the one set where the accuracy target
was missed, and without that set the per-design saving is 9.5%.

The next steps are to cut the cost of reading the score, which means asking
PyBaMM for fewer output variables, and to add a fifth and sixth parameter set.
Then the across-chemistry interval can be narrowed. Numbers:
[`results.txt`](../../research/cell-fidelity/experiments/runner7m/results.txt);
the plan, committed before the bench ran, is in the programme's
[`LOG.md`](../../research/cell-fidelity/LOG.md).
