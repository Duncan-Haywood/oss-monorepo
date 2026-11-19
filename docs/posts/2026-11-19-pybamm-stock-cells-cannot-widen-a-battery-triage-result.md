---
title: "Looking for a fifth battery chemistry in PyBaMM: three cells barely fade, and the fourth breaks the forecast"
seo_title: "PyBaMM parameter sets: why a fifth triage chemistry failed"
date: 2026-11-19
tags: [research, batteries, pybamm, simulation, negative-result]
description: "We probed eight conditions on four unused PyBaMM cells for a battery triage study. Three barely lose lithium; on Ramadass2004 the lithium-loss forecast breaks."
---

The [cell-fidelity](../../research/cell-fidelity/) programme has a triage rule
for battery design searches that use PyBaMM's full DFN model. Every design gets
ten cycles. A drift score then flags the risky ones, and only those run on to
cycle 50. On leave-one-pool-out folds the rule beats a uniform run length on 14
of 20 folds (sign test p = 0.031). But the advantage was measured on four
parameter sets, and bootstrapped over those four it ran from −8.5 to +0.25 DFN
cycles per design. That is consistent across folds, but not yet shown across
chemistries. The obvious fix was to add sets.

## What we ran

We wrote the plan down before running anything
([LOG](../../research/cell-fidelity/LOG.md), 7p plan). It named eight candidate
conditions on four cells no triage step had used: `Mohtat2020`, `Ecker2015`,
`Marquis2019` and `Ramadass2004`, each at two currents. A short probe would
decide which to keep: four designs, 20 cycles each. A condition was kept if
every design finished, every design plated lithium, and the median design lost
at least 3% of its cyclable lithium between cycles 2 and 20. The four committed
sets lose 4.8% to 17% on that measure. The first two kept on different cells
would each get 56 designs simulated to cycle 100. They would then go through
the same correction, threshold and leave-one-pool-out code as the paper's
headline.

## What came out

Only one condition passed.

| condition | lithium lost, cycles 2 to 20 (share of n_Li) |
|---|---|
| Mohtat2020 at 3x / 4x | 0.48% / 0.61% |
| Ecker2015 at 2x / 3x | 0.53% / 0.17% |
| Marquis2019 at 2x / 3x | 0.16% / 0.08% |
| Ramadass2004 at 1x | **5.04%** (kept) |
| Ramadass2004 at 2x | dropped, 1 of 4 designs failed |

All the cells plate: plating is 96% to 99.9% of the lithium they lose. They just
lose very little of it, under an eighth of what the committed sets lose. On
Ecker2015 and Marquis2019, more current gave *less* fade. Our guess is that the
charge hits its voltage cut-off sooner; we did not test that.

On `Ramadass2004`, 45 of 56 designs reached cycle 100. The other 11 failed
inside the solver in their first cycles and were dropped and counted. The
triage comparison then turned out to be empty, for a reason upstream of
triage. The ten-cycle lithium-loss forecast breaks on this cell:

- its cycle-99 error has a q75 of 12.6, against 0.06 to 0.12 on the four
  committed sets;
- running on to cycle 50 barely helps (the median error falls by 9%);
- so every rule's best policy is "stop every design at cycle 10".

That policy "meets the target" on all five folds, but only because nothing
beats it, so the test it passes is empty. The pooled interval for threshold
minus uniform moves from −8.50 to +0.25 to −7.53 to +0.33 cycles per design.
It still spans zero.

## Why the forecast breaks

This part is post hoc and untested. The forecast converts lithium loss into a
voltage-window shift by inverting each cell's open-circuit-potential (OCP)
tables over the whole 0 to 1 stoichiometry grid. `Ramadass2004` is the only cell
of the eight whose positive-electrode table is not monotone on that grid. It
changes direction 7 times and ranges from −2.6 V to 57 V, and its negative
table reaches 1,729 V at the edge. These fits are valid inside the cell's own
operating window, which is all the DFN needs, but not across the full grid the
forecast inverts. `NCA_Kim2011`'s positive table is also extreme at the edges
(−187 V to 11 V) and the forecast works there. So the direction changes look
like the cause, not the edge values.

## What this means for the paper

PyBaMM's stock parameter sets don't give us a fifth chemistry under this
protocol. The paper will say its breadth is four parameter sets and give this
measured reason. We also now have a cheap screen any future cell should pass
before a 100-cycle bench: a 20-cycle fade probe and an OCP monotonicity check.
Getting more breadth means one of two things:

- degradation parameters fitted so those cells fade, reported as a sweep and
  not as stock behaviour;
- or a forecast law that clips each OCP table to the cell's own window, which
  can be rerun on the 45 `Ramadass2004` designs already simulated.

Code, data and the full table:
[`experiments/sets7p`](../../research/cell-fidelity/experiments/sets7p/run.py),
[`results.txt`](../../research/cell-fidelity/experiments/sets7p/results.txt).
Everything is modelled fade in one PyBaMM version (26.10.1.1), with OKane2022's
degradation parameters copied onto every cell. That copying is the likely
reason three of the cells barely fade.
