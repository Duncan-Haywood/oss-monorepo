---
title: "Reading a battery triage score from the solver's state: 20x cheaper, same decisions"
seo_title: "PyBaMM triage score from solver state: same calls, 17% saved"
date: 2026-11-19
tags: [research, batteries, pybamm, simulation, design-search]
description: "Reading the cell-fidelity drift score from PyBaMM's dead-lithium state cut the read from 0.20 s to 0.009 s, kept all 64 decisions and lifted the saving to 17%."
---

The [cell-fidelity](../../research/cell-fidelity/) triage runner simulates a
battery design for ten cycles in PyBaMM's full DFN model, reads a drift score
from where lithium plates in the negative electrode, and either stops or keeps
solving the same `Simulation` to cycle 50. The [last step](2026-11-19-a-battery-triage-runner-that-matches-its-own-analysis.md)
built it and found it saved 14.0% of wall time per design against running
everything to cycle 50. Reading the score cost about one cycle's worth of
compute per design, though, and that was most of the gap to the 19% the cycle
count promised.

## Where the read cost went

The runner read the score the way the analysis had: it pulled the x-resolved
plating current for every output step of cycles 2 and 10, integrated it over
time with the trapezoid rule, and read ten cycles of lithium loss. Two things
made most of that unnecessary:

- **No parameter set's policy uses the lithium-loss observable.** The frozen
  policy picks one observable per set (plating depth at cycle 2, or its drift
  to cycle 10), so the runner now computes only that one.
- **The plated lithium is a state.** In PyBaMM's irreversible plating option,
  plated lithium accumulates in the dead-lithium concentration, whose time
  derivative is the plating rate. The change in that state across a cycle is
  the solver's own integral of the plating current, so two state vectors per
  cycle replace the full time series. It is also more exact than a trapezoid
  on output points.

## What it measured

The plan and its four hypotheses went into the programme's
[`LOG.md`](../../research/cell-fidelity/LOG.md) before the bench ran. The bench
was the previous step's: 64 held-out designs on four parameter sets, each run
once through the runner and once as a plain 50-cycle simulation, in separate
processes.

| | runner 7m | lean read 7n |
|---|---|---|
| score read, median | 0.20 s | 0.009 s |
| in cycle equivalents | 1.09 | 0.043 |
| decisions matching the offline triage | 64 of 64 | 64 of 64 |
| wall-time saving per design | 14.0% | 17.2% |
| share of total compute saved | 9.7% | 12.6% |
| gap to the cycle model | 0.041 | 0.010 |

Scores moved by a median 1 × 10⁻⁴ relative, at most 0.2%. The largest moves
were on `Chen2020`, where the policy reads a small difference of two centroids
and so feels the trapezoid error most. No decision changed, including the two
designs within 1% of the threshold.

## What is left

The runner now delivers what the cycle model predicts, less about one percent.
The remaining gap between the 19% cycle saving and the 17% wall-time saving is
the fixed cost of building the model, about five cycles per design. The saving
is uneven by chemistry: 32.7% on `Chen2020`, 8% to 19% on the other three.
Without `Chen2020`, the set where the earlier accuracy check missed its target,
the saving is 12.1%.

Two limits. The dead-lithium identity holds only for the irreversible plating
option; the reversible ones would also need the plated-lithium state. And the
accuracy side is still the earlier step's: this bench checked decisions and
time, not tail error.

Next is a fifth and sixth parameter set run through this runner, so that
accuracy and wall time come from the same runs. Numbers:
[`results.txt`](../../research/cell-fidelity/experiments/lean7n/results.txt);
tool: [`triage.py`](../../research/cell-fidelity/experiments/lean7n/triage.py).
