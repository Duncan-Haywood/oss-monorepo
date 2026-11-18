---
title: "A lithium-plating forecast trick, tested on 32 battery designs it never saw"
seo_title: "Lithium-plating forecast: held-out test on 32 battery designs"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating]
description: "Anode node-gain profiles learned on 40 simulated cells still help a ten-cycle plating forecast on 32 new ones, but by less, and with big single-design misses."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a battery design will have lost by cycle 99, mostly to lithium
plating, from a ten-cycle simulation. The last three steps found that the
forecast's weak input is how fast the anode's open-circuit potential rises
at each point through the electrode's thickness. Each point lags the
uniform shift the forecast law assumes, by a factor I call its gain. Gains
learned from other designs of the same chemistry helped. A straight line of
gain against anode thickness helped most of all, cutting `OKane2022`'s
error from 6.7% to 2.7%.

That line had a problem: I found it *after* seeing the data, and it was
judged on the same 40 designs that suggested it. So this step tested it on
designs it had never seen.

## What I did

I drew 8 fresh designs per parameter set (32 in all) from the same design
pools, excluding every design used before. I ran each in PyBaMM's DFN
model for 100 cycles with SEI growth and lithium plating on, recording the
plating and the anode potential at each of 20 points through the
electrode. Before running anything I committed the plan and four
hypotheses. The main forecast was a *gated* thickness line: use the line
only on a set where, in the training designs, the separator-side gain rises
with thickness (Spearman correlation at least 0.5), and otherwise fall back
to the plain uniform lever. Every profile was fitted on the old 40 designs
only and read nothing of a new design past cycle 10.

## What came out

Set-median error in the cycle-99 lithium-loss forecast, on the 32 new designs:

| set | uniform lever | median profile | 3 nearest | thickness line | measured-OCP ceiling |
|---|---|---|---|---|---|
| `Ai2020` | 4.4% | 5.4% | 5.6% | 5.0% | 3.6% |
| `Chen2020` | 7.5% | 7.5% | 7.0% | 6.5% | 4.1% |
| `OKane2022` | 7.2% | 6.2% | 6.7% | 5.6% | 1.5% |
| `NCA_Kim2011` | 3.3% | 2.8% | 2.9% | 2.5% | 0.3% |

Three things held up. Every borrowed profile reads the cycle-99 potential
rise better than the uniform lever on all four sets. On `NCA_Kim2011` the
thickness line cuts that potential error fourfold, from 19.9 to 4.9 mV. And
the thickness line has the lowest median forecast error of any profile on
three of four sets.

Two things did not. The gains are smaller than they were in-sample, and
they are lumpy: the line beats the uniform lever on only 19 of 32 designs.
On `OKane2022` it takes four designs from 6 to 8% error down to 1 to 4%,
but misses two thin ones by 14 to 15%. Those two sit at or below the
thinnest training design, where a line in thickness has to extrapolate.
And my pre-registered gate was the weak link. Its 0.5 threshold was a
guess, and `OKane2022` came in just under it at 0.46. So the gated forecast
fired only on `NCA_Kim2011` and threw away `OKane2022`'s largest gain. Of
the four hypotheses, two were supported (the gated set improves; the median
profile replicates on `OKane2022`) and two were inconclusive.

One side lesson about reproducibility. Rounding the simulation records to
seven significant digits, as an earlier step did to save space, moved
`Chen2020`'s results by up to 0.6 points. The forecast takes differences of
cumulative lithium totals, and rounding eats those differences. I re-ran
the bench at full precision. The re-run reproduced the first report
character for character, and that full-precision file is the one committed.

## What it means for a design search

The advice barely changes. To trust a plating forecast, fit its line
through 30 to 50 cycles. On a chemistry like `NCA_Kim2011`, where the
anode's gain plainly rises with thickness, a thickness-line profile from a
few fully simulated designs gets you there in ten cycles. Elsewhere it
improves the typical design but can badly miss a single one, so it is not
a rule yet.

Next: use the line only inside the thickness range it was trained on, and
test that rule on another fresh draw.

Code, data and the full log:
[`research/cell-fidelity`](../../research/cell-fidelity/) (milestone 5zy in
`LOG.md`; figure `experiments/freshnode/freshnode.svg`). These are model
results from one PyBaMM version, not measured cells.
