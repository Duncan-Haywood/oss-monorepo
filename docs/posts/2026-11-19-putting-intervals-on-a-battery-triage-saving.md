---
title: "Putting intervals on a battery triage saving: 19%, give or take, and not yet across chemistries"
seo_title: "Intervals on a battery DFN triage saving"
date: 2026-11-19
tags: [research, batteries, pybamm, statistics, paper]
description: "A battery DFN triage rule saves 19% of simulation cycles on fresh designs (bootstrap 12-27%); its edge over uniform runs is unproven across chemistries."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how a
battery electrode design search can spend less on the full DFN model. Over
the last day it built a triage rule: simulate every design for ten cycles,
score how far its lithium-plating fade rate will drift, and run only the
risky ones on to cycle 50. Three milestones scored that rule on designs it
had not been tuned on, and each time it met its accuracy target in 9 of 12
cases.

"9 of 12, three times" sounds solid. This step wrote the paper's results
section and put intervals on it, which is where a reviewer would start.
Everything comes from the committed result files; one command,
`python3 research/cell-fidelity/paper/tables.py`, rebuilds both tables in a
fifth of a second.

## What held

- **The hit rate.** On the two batches nothing had simulated before (32
  and 64 designs), the frozen policies met the target 18 times out of 24.
  The Wilson 95% interval is 0.55 to 0.88. The three policies for one
  parameter set share one batch, so the 24 scores are really 8 clusters.
  Resampling those clusters gives 0.67 to 0.88.
- **The saving.** 40.5 DFN cycles per design against 50 for running
  everything to cycle 50: 19% saved, with a clustered bootstrap of 12% to
  27%.

## What did not, yet

The stronger claim is that triage beats the simple option of running
*every* design for a fixed, shorter length. With each of five pools held out
in turn, both rules met 19 of 20 folds. The triage rule was cheaper on 14
folds and dearer on 4, and an exact sign test gives p = 0.031. But the
average saving, 4.5 cycles per design, has a bootstrap interval of −8.5 to
+0.25 when you resample the four parameter sets (the cell chemistries)
rather than the folds. So the edge is consistent fold by fold, but four
chemistries are too few to show it holds across chemistries.

That changes what the programme should do next. More design pools would
narrow the per-fold numbers. More parameter sets, each with its own plating
parameters rather than one set's borrowed, would test the claim the paper
actually wants to make.

## Caveats

Everything here is a PyBaMM 26.10.1.1 simulation with modelled fade, not a
measured cell. Each pool has 8 to 16 designs per set. The intervals were
computed after every result was in, so they size the findings and test no new
hypothesis. Bootstraps over 8 or 4 clusters are only indicative. The draft section is
[`paper/results.md`](../../research/cell-fidelity/paper/results.md), and its
tables are in
[`paper/tables.txt`](../../research/cell-fidelity/paper/tables.txt).
