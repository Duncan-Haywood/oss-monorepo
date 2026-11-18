---
title: "A battery drift forecast that got closer and made the plating forecast worse"
seo_title: "A closer drift forecast that worsened a plating forecast"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Tying the plating-overpotential drift to the charge overpotential cut its ten-cycle error by up to 73%, and still made cycle-99 lithium-loss forecasts worse."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how much
lithium a battery design will lose to plating by cycle 99, using only a
ten-cycle simulation. After four milestones today, the
[capacity factor](2026-11-18-what-bends-a-plating-forecasts-line.md) is
solved to within a few per cent. The error that is left on LG M50 cells (5.4
to 6.7%) sits in one input: the part of the plating overpotential that does
not come from the anode's open-circuit potential. I'll call it the drift.

## The idea

Over cycles 2 to 10 the drift rises by a fraction of a millivolt while the
effective charge overpotential falls and starts to level off. Milestone 5zs
had already fitted a saturating curve to that fall. So the forecast for this
step ties the drift to it: drift = k × (how far the charge overpotential has
fallen), with one slope k fitted on the ten cycles. The ten-cycle straight
line from milestone 5zq is the comparison. Four hypotheses were committed
before anything was computed. The plan also named the risk: a tie to a
quantity that falls and levels off can rise and level off, but it can never
turn over.

## What came out

On 40 PyBaMM DFN designs across four parameter sets:

| set | drift error at cycle 99, tie | line | forecast error, no drift term | with the tie | with the measured drift |
|---|---|---|---|---|---|
| `Ai2020` | 3.5 mV | 13.0 mV | 2.3% | 4.5% | 4.9% |
| `Chen2020` (LG M50) | 6.0 mV | 8.7 mV | 5.4% | 7.6% | 2.4% |
| `OKane2022` (LG M50) | 4.9 mV | 7.1 mV | 6.7% | 7.9% | 6.5% |
| `NCA_Kim2011` | 0.02 mV | 0.02 mV | 3.0% | 3.0% | 3.0% |

The tie is a better drift forecast on every set, and a worse plating forecast
on every set where the drift is not zero. On LG M50 the drift turns negative
after cycle 10 (about −2.5 mV at cycle 99). Every ten-cycle forecast I tried
keeps it positive, so adding any of them pushes the plating forecast the
wrong way. Refitted over the whole run, the tie's slope changes sign on both
LG M50 sets. Within ten cycles nothing hints at the turn-over.

The last column is a ceiling: the node lever given the true drift. It splits
the two LG M50 sets. On `Chen2020` the true drift halves the error, so the
drift really is the missing piece there. On `OKane2022` it barely helps, so
something else is behind that set's 6.5%. On `Ai2020` the true drift makes
the forecast worse, which means the node lever's other term already
accounts for it.

## What it means

Cutting a forecast input's error is not the same as cutting the forecast's
error. Here the sign of the input mattered more than its size. Of the
ten-cycle options, leaving the drift out or freezing it at its cycle-10
value works best. For a real design search the advice from earlier
milestones still holds: fit the forecast line through 30 to 50 cycles, not
10. The next step is to find out what turns the drift over on `Chen2020`.

Limits: the same 40 designs every milestone has used (a check on known
designs, not a held-out test); a one-slope tie; the drift is a model internal;
one PyBaMM version; modelled fade only. Plan, outcome and numbers:
[`LOG.md`](../../research/cell-fidelity/LOG.md), 5zt.
