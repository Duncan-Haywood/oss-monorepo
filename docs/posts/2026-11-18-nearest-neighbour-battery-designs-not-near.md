---
title: "Matching a plating forecast to its nearest battery designs did not help; anode thickness might"
seo_title: "Nearest-neighbour node gains for battery plating forecasts"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, transfer]
description: "Borrowing anode node gains from the three nearest battery designs did not beat a set median. A line in anode thickness did, on two of four sets."
---

The [cell-fidelity](../../research/cell-fidelity/) programme tries to forecast
how much lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation. The [previous step](2026-11-18-borrowing-node-lag-from-other-battery-designs.md)
found one fix that works on one parameter set. It takes the profile of how far
each anode layer lags the forecast's uniform shift, a "late gain" per layer,
from the other fully simulated designs of the same chemistry. On `OKane2022`
(LG M50) the median profile cut the error from 6.7% to 4.1%. On `Chen2020` and
`NCA_Kim2011` it made things worse. On those sets the gain of the layer next to
the separator varies a lot from design to design, and a median throws that
variation away.

The obvious next try is to stop averaging over every design and borrow only
from the designs that look like the one you're forecasting. Before running
anything I wrote down four hypotheses
([`LOG.md`](../../research/cell-fidelity/LOG.md), 5zx). The method takes the
three nearest designs in the scaled four-parameter design space (cathode
thickness, both porosities, N/P ratio) and uses their median profile. As a
second variant, reported but not hypothesised, it fits a per-layer straight
line of gain against anode thickness. Each design was held out in turn, on the
same 40 PyBaMM DFN designs, with no new simulation.

## What came out

Set-median error of the cycle-99 lithium-loss forecast:

| set | uniform lever | set median (5zw) | 3 nearest | thickness line | measured-OCP ceiling |
|---|---|---|---|---|---|
| `Ai2020` | 2.3% | 2.2% | 2.3% | 3.7% | 3.5% |
| `Chen2020` | 5.4% | 6.5% | 6.5% | 6.7% | 3.9% |
| `OKane2022` | 6.7% | 4.1% | 4.5% | 2.7% | 3.5% |
| `NCA_Kim2011` | 3.0% | 4.2% | 4.1% | 1.5% | 1.0% |

The nearest-neighbour profile failed three of its four pre-registered tests. It
beat the set median on one set of four, and it repaired neither of the sets the
median hurt. It did keep `OKane2022` past the halfway mark to the ceiling. One
reason is plain geometry: with 8 to 12 designs in a four-dimensional box, the
third-nearest design sits 0.6 to 0.75 of the box's side away, so the
"neighbours" aren't near. The neighbours did predict the separator layer's gain
about twice as well as the median on `Chen2020` and `OKane2022`. That better
gain didn't carry through to the forecast, though. `Chen2020`'s misses come from
a few thick designs that are 9 to 17% off whatever lever is used.

The thickness line is the more interesting result. On `OKane2022` and
`NCA_Kim2011` the separator layer's late gain rises with anode thickness, and
two parameters per layer, fitted on 7 to 11 other designs, take the forecast to
or below the error you get with the measured OCP. On `Ai2020` and `Chen2020` the
gain isn't monotone in thickness (one `Ai2020` design has 2.55 where its
neighbours have about 1.1), and the line makes things worse. I found this after
the plan, so it is a lead, not a result. The next step is to pre-register it on
fresh designs, with a check that falls back to the uniform lever when the
training designs aren't monotone.

## What a design search should do

The advice hasn't changed: fit the lithium-loss law through 30 to 50 cycles.
On `OKane2022`-like cells, a node-gain profile from a few fully simulated
designs lets ten cycles do the job.

Limits: all 40 designs were seen in earlier milestones, the pools are small, and
several separator-layer gains sit at the ends of the gain grid. The layer OCPs
are model internals, everything ran on one PyBaMM version, and the fade is
modelled. Code, rows and the figure are in
[`experiments/nodematch/`](../../research/cell-fidelity/experiments/nodematch/).
