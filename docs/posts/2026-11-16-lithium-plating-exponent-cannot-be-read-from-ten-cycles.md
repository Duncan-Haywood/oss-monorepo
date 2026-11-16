---
title: "A battery's first ten cycles cannot tell you its lithium-plating exponent, and LG M50 needs a steeper one"
seo_title: "Ten cycles cannot measure the lithium-plating exponent"
date: 2026-11-16
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "On 128 fresh PyBaMM designs, a per-cell plating exponent from ten cycles worsened the 100-cycle forecast, and LG M50 needs 1.2 to 2.3 times the physical value."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a cell will lose to plating over 100 cycles from its first ten,
so an electrode design search does not have to simulate all 100. The test bed
is PyBaMM's full DFN model with SEI growth and lithium plating, on four
parameter sets. The forecast is now within about 10% on LG M50 (`Chen2020`,
`OKane2022`). It still over-predicts there, and under-predicts on `Ai2020`.

The [previous milestone](2026-11-16-true-overpotential-drift-makes-plating-forecast-worse.md)
ruled out the overpotential as the cause and pointed at one number the
forecast borrows rather than measures: the kinetic exponent &kappa;. It sets
how fast plating slows as the negative electrode's potential rises with each
cycle's lost lithium. Every milestone since 5zb has used the textbook value,
&alpha;F/RT = 25.3 per volt, from `OKane2022`'s plating transfer coefficient
(0.65 at 25 °C), on all four sets.

## Can a cell's own first ten cycles give its exponent?

Milestone 5zf tried two ways to read &kappa; from cycles 2 to 10:

- **fit:** choose the &kappa; that makes the law's accumulated plating
  variable most nearly a straight line in the cycle number, which is what the
  law says it should be;
- **slope:** regress the log of each cycle's plating on the potential rise,
  since the law says plating slows by exp(&minus;&kappa; &times; rise).

It also computed an oracle, which is not a forecast: the &kappa; that makes
each design's cycle-99 forecast exact. That says which exponent the law
*would* need, even if no ten-cycle method can find it.

On the 512 designs earlier milestones had simulated, the answer was already
clear, and the milestone pre-registered five claims before running 128 new
designs (a new seed, currents no milestone had used). All five held.

| pool | &kappa; = 25.3 | ten-cycle *fit* | oracle &kappa;* (median) | lever rise, cycles 2 to 10 |
|---|---|---|---|---|
| `Ai2020@0.5875x` | 8.1% | 9.0% | 20.4 /V | 6.5 mV |
| `NCA_Kim2011@0.71875x` | 1.9% | 5.4% | 22.9 /V | 46.1 mV |
| `Chen2020@1.34375x` | 9.9% | 12.7% | 45.4 /V | 0.7 mV |
| `OKane2022@1.40625x` | 5.9% | 12.2% | 31.7 /V | 0.6 mV |

The error columns are the median absolute log error of the predicted
cycle-99 lithium loss, 32 designs per pool.

## Three things it shows

**The per-design exponent makes the forecast worse everywhere.** On LG M50
the reason is simple: the potential the exponent multiplies rises by less than
a millivolt in ten cycles. Any &kappa; fits ten cycles about equally well, and
the estimate wanders. On two thirds of the `Chen2020` designs it ran to the
search's 100 per volt ceiling.

**Where the potential does move, the estimate tracks the truth but reads
high.** On `NCA_Kim2011` the lever rises 40 to 50 mV in ten cycles. The
ten-cycle estimate ranks designs in the same order as the oracle (Spearman
0.72), but sits 6 to 8 per volt above it, enough to nearly triple the forecast
error.

**The exponent the law needs is not the same on every set.** The oracle puts
`Ai2020` and `NCA_Kim2011` near the physical value, 20 and 23. LG M50 wants 45
and 32 on the fresh pools, and 30 to 57 across all ten LG M50 pools the
programme has run. So the law's potential lever is too shallow on LG M50 when
the overpotential is held constant. That is the over-prediction, and it is
also the compensation the previous milestone saw. On `Ai2020` the median need
is close to the physical value; its error is scatter from design to design,
not a bias a different exponent could remove.

## What comes next

A design search cannot use the oracle, but it can afford one calibration per
chemistry. The next step is one &kappa; per parameter set, fitted on that
set's earlier 100-cycle runs and tested on fresh designs at new currents. The
other open question is mechanism: whether LG M50's steeper lever equals the
ratio of the potential rise at the separator-side particle surface to the
open-circuit rise the law reads. If it does, the factor can be computed rather
than fitted.

The caveats are unchanged: one current per set, `OKane2022`'s plating
parameters on every set, one PyBaMM version (26.10.1.1), and modelled fade,
not measured cells. The code, the 128-run bench, the dev table and the
pre-registration are in the [project directory](../../research/cell-fidelity/)
and its research log.
