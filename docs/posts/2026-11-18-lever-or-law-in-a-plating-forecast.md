---
title: "Half of a battery plating forecast's error is the lever, half is the law's straight line"
seo_title: "Plating forecast error: half lever, half law"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Given the true anode potential rise, a ten-cycle lithium-plating forecast's error on LG M50 cells halves, from 8.2% to 3.8%. The law's line holds the rest."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation, so an electrode design search can skip most full DFN runs. The
forecast is a small law. Plating slows as the anode's open-circuit potential
rises with lost lithium, so the law integrates `exp(25.3 × rise)` over lost
lithium into a quantity R that should grow in a straight line with cycle
number. Fit the line through ten cycles, read it at cycle 99, and invert.

Yesterday's milestone found the law read the potential in the wrong place, on
the graphite plateau rather than where the plating sits. Reading it at each
electrode node fixed the rise but improved the forecast on only 2 of 4
parameter sets. That leaves two possible culprits: the lever (how the
potential rise is predicted) or the law (whether R really grows in a straight
line).

## The test

Give the law the answer. For each of the same 40 PyBaMM DFN designs I fed it
the rise the simulation actually recorded where the plating was, cycle by
cycle to cycle 99. No lever can beat that, so whatever error is left belongs
to the law. The three hypotheses were committed before anything was computed.

## What came out

Set-median error in cycle-99 lost lithium, with the line fitted through
cycles 2 to 10:

| parameter set | law's own lever | node lever (5zn) | true rise |
|---|---|---|---|
| `Chen2020` (LG M50) | 8.2% | 5.9% | 3.8% |
| `OKane2022` (LG M50) | 5.9% | 7.6% | 3.4% |
| `NCA_Kim2011` | 2.2% | 4.8% | 1.2% |
| `Ai2020` | 8.3% | 2.3% | 4.2% |

On the LG M50 cells the true rise roughly halves the error, and that half is
the lever's. The other half stays because the law's line bends: even with
the true rise, the slope of R over cycles 50 to 99 differs from its slope
over 2 to 10 by 9 to 13% (set medians). That is just over the 10% I had set
as the bar for "the line holds", so that hypothesis is inconclusive. No lever
read from the first cycles can remove that part.

`Ai2020` is the odd one. There the node lever beats the true rise, 2.3%
against 4.2%. That isn't a better lever. It under-reads the early rise, and
the error happens to cancel the line's upward bend on that set.

The second question was why the node lever over-reads the early rise on
`OKane2022`. Yesterday I guessed the nodes next to the current collector,
whose lithium content is lowest. That guess was wrong. The collector half
carries 21% of the weighted over-read and is the majority on none of the 12
designs. After the verdicts I looked at where it does sit: the four nodes
next to the separator carry 56% of it. Those nodes are the most lithiated,
and most of the plating happens there.

## What it means for a design search

The advice from two milestones ago, to fit the line through 30 to 50 cycles
instead of 10, now has a reason behind it. Even with the true rise, the
ten-cycle line costs 3 to 4% on LG M50. With fifty cycles the true-rise
forecast is within 1.0 to 1.6% on every set, and the law's own lever gets
within 1.1 to 3.2%. The next question is the law's rate form. The law fixes
the end-of-charge overpotential at its early value while the cell's
resistance grows, and that may be what bends the line.

Limits: one pool of 40 designs per study, all seen in earlier milestones;
the true-rise forecast reads cycle 99, so it diagnoses the error and can't
forecast; one PyBaMM version; modelled fade, not a tested cell. Numbers,
code and the pre-registration are in the programme's
[log](../../research/cell-fidelity/LOG.md) and
[`experiments/oracle/`](../../research/cell-fidelity/experiments/oracle/).
