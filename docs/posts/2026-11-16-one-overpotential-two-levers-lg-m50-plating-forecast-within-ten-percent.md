---
title: "One overpotential, two levers: a ten-cycle LG M50 plating forecast gets within 10%"
seo_title: "Ten-cycle LG M50 lithium-plating forecast within 10%"
date: 2026-11-16
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Reading the plating potential at the loaded charge window, like the charge time, cuts a 100-cycle LG M50 fade forecast error from 20% to 10%, no new parameter."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how much of a
lithium-ion cell's 100-cycle lithium-plating fade can be forecast from its
first ten cycles, so a design search does not have to simulate all 100. The
model is PyBaMM's full DFN with SEI growth and lithium plating. The hard case
is LG M50 (`Chen2020` and `OKane2022` parameters), where every law so far has
over-predicted the loss.

## The two levers

The forecast law comes from the plating kinetics. Plating per cycle grows with
how long the charge lasts and shrinks as lost lithium raises the negative
electrode's potential at the end of the charge. The previous milestone, 5zc,
fixed the first lever. It measured an effective overpotential, &eta;, from each
design's first ten cycles of charge capacity: the charge stops when the
open-circuit voltage is &eta; short of the cut-off. It still read the
potential lever at the open-circuit cut-off.

That is inconsistent. If the charge stops &eta; short, the electrode's
open-circuit state at the end of the charge is the top of that shorter window,
so milestone 5zd reads the potential rise there too. It is the same &eta;, so no
new number is fitted.

## What the fresh pools said

The plan was committed before any run: 128 new electrode designs at currents
no milestone had used, simulated to cycle 100 (about 20 minutes on four cores).

| pool | 5zb | 5zc | 5zd |
|---|---|---|---|
| `Chen2020` (LG M50) | 0.270 | 0.202 | **0.104** |
| `OKane2022` (LG M50) | 0.259 | 0.167 | **0.064** |
| `NCA_Kim2011` | 0.028 | 0.033 | **0.020** |
| `Ai2020` | 0.040 | **0.025** | 0.076 |

The figures are median |ln(predicted / simulated)| lithium loss at cycle 99, so
0.10 is about 10%. On LG M50 the new reading wins on 59 of 64 designs. It also
forecasts the measured surface-potential rise next to the separator better
than the open-circuit reading did (17 to 21 mV of error against 27 to 35 mV).

The cost falls on `Ai2020`. Its error triples to 7.6%, 0.051 worse, just past
the 0.05 harm limit the plan set. Its overpotential drifts by about 20 mV over
100 cycles, so a fixed &eta; overstates the late potential rise. Rank
correlation on LG M50 also dips (0.97 and 0.94), so the change fixes the size
of the loss more than the order of designs. Four of five hypotheses were
supported and one was mixed.

The next step is to let &eta; follow its own ten-cycle trend and see whether
the `Ai2020` miss closes without losing the LG M50 gain.

Limits: modelled fade in one PyBaMM version; one current per set; the form was
chosen after looking at 256 earlier designs and seven candidate forms, all
listed in the dev table.

Code and table: [`experiments/consistent/`](../../research/cell-fidelity/experiments/consistent/results.txt).
Research log: [`LOG.md`](../../research/cell-fidelity/LOG.md).
