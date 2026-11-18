---
title: "Ten cycles now forecast a battery's charge-capacity fade; the plating forecast's error is elsewhere"
seo_title: "Ten-cycle charge-capacity forecast: the error is elsewhere"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating]
description: "A saturating overpotential fit forecasts cycle-99 charge capacity within 2 to 5% from ten cycles, and even the exact factor barely moves the plating forecast."
---

The [cell-fidelity](../../research/cell-fidelity/) programme is trying to
forecast how much lithium a battery design loses to plating by cycle 99
from a ten-cycle simulation. One input to its forecast law is the capacity
factor: the charge the cell takes at cycle 2 divided by the charge it takes
at cycle n.
[The last step](2026-11-18-charge-capacity-fade-is-the-electrode-balance.md)
forecast that factor from the electrode balance (lost lithium sliding the
open-circuit window along the two electrodes' potential curves) plus a
ten-cycle line in the charge overpotential η. It got within 4 to 8% at
cycle 99. The leftover error opened late, because the line kept falling
after the real η had levelled off.

## What I did

I used the same 40 PyBaMM DFN designs on four parameter sets, with no new
simulation. I wrote the plan and the four hypotheses down and committed them
before computing anything. Then I swapped the η line for a saturating fit,
η(l) = c + d·exp(−(l − L₂)/λ), fitted to cycles 2 to 10 over a fixed grid
of decay lengths. I also asked the question that decides where the
programme goes next: if the forecast used the *measured* capacity factor,
read from the full 99-cycle run, how much better would it get?

## What came out

| set | factor error, η line | factor error, saturating η | node lever | node lever + measured factor |
|---|---|---|---|---|
| `Ai2020` | 7.6% | 2.4% | 2.3% | 2.0% |
| `Chen2020` | 6.7% | 4.5% | 5.9% | 6.3% |
| `OKane2022` | 6.8% | 4.3% | 7.6% | 6.9% |
| `NCA_Kim2011` | 3.6% | 4.8% | 4.8% | 3.5% |

The first two columns are set-median errors in the cycle-99 capacity
factor. The last two are set-median errors in cycle-99 lithium lost to
plating. With the saturating fit, the factor forecast is within 5% on all
four sets. The decisive number is the last column. Even the exact factor
moves the forecast by less than a point on three of the four sets. On
`Chen2020` it makes it slightly worse.

So the capacity factor is no longer where the ten-cycle forecast goes
wrong. With the saturating factor, the forecast beats the law's own
plating lever on 22 of 40 designs, short of the 26 I had set as the bar.
On the two LG M50 sets it is still 5 to 7% off. An earlier step showed
that feeding in the measured plating overpotential brings that down to
about 1.5%. What's left is the plating overpotential's own drift, which
rises over the first cycles and then turns over.

## Limits

Each set has one pool of 8 or 12 designs, and earlier steps had already
seen all of them. Half of the fitted decay lengths sit at an end of the
grid, so nine points don't pin the saturating fit down well. η is a
symmetric cut-off shift standing in for the real charge overpotential. All
of this is one PyBaMM version and modelled fade, not cells on a bench. The
full numbers and the pre-registered verdicts are in the project's
[log](../../research/cell-fidelity/LOG.md) (milestone 5zs).
