---
title: "Where plating sits at cycle two flags the battery designs a ten-cycle forecast gets wrong"
seo_title: "Cycle-two plating depth flags drifting battery designs"
date: 2026-11-19
tags: [research, batteries, pybamm, lithium-plating, forecasting]
description: "On 104 PyBaMM designs, cycle-2 plating depth predicts each design's fade-rate drift (rho 0.80) and halves the forecast's upper-quartile error."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how much
lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation. This morning's step found a floor under that forecast on LG M50
cells. Even with every input to the fade law measured, the law's own ten-cycle
line misses cycle 99 by about 2% at the median. The cause was not a shared
curve that a longer fit or a borrowed bend could fix: each design's rate drifts
a few per cent up or down over the run, and the direction varies by design.

So the next question was whether that drift can be seen early. If ten cycles
show which way a design will drift, the forecast can correct for it, or a
design search can at least flag the designs it should not trust.

## What we tested

We defined a drift multiplier m for each of 104 PyBaMM DFN designs: how far the
law's rate over cycles 10 to 99 departs from its ten-cycle slope (m = 1 means
the line was right). Before computing any correlation we wrote down three
ten-cycle observables: where in the anode the plating sits at cycle 2, how that
position moves by cycle 10, and how lithium loss itself bends over the first
ten cycles. We also fixed four hypotheses and the correction: a straight-line
fit of m on whichever observable correlates best with m on the other designs,
leaving the design being forecast out.

## What we found

The drift is predictable. On both LG M50 parameter sets the plating depth at
cycle 2 correlates with m at Spearman ρ = 0.80 (permutation p = 0.0003 after a
Holm correction). Plating that sits nearer the separator means the rate speeds
up later. The correlation holds inside each of the three design pools, so it is
not an artefact of how the pools were drawn.

It does not lower the median. With the correction the set-median cycle-99 error
is 2.3% and 2.1%, against the line's 1.8% and 1.9%. The typical design drifts by
about 4%, and that is about the size of the correction's own error, so there is
nothing to gain in the middle of the set. That hypothesis is refuted.

It does fix the tail. We only looked at quantiles after the pre-registered
report, so this part is a post hoc finding. The drift is heavy-tailed: a quarter
of the designs drift by 10 to 25%, and those are the designs the plating depth
flags. The correction cuts the upper-quartile error from 8.0% to 3.5% on
`Chen2020` and from 7.3% to 3.0% on `OKane2022`. The 90th percentile drops from
10.1% to 6.5% and from 9.0% to 5.3%.

On the real ten-cycle forecast, the one that guesses its inputs instead of
measuring them, the same correction beats the line on all four parameter sets.
The biggest gain is on `NCA_Kim2011`, where the median error goes from 4.0% to
1.4%.

## Why it matters

A design search loses most from a few badly wrong forecasts, not from a 2% error
everywhere. This result says those forecasts can be found before cycle 11:
they are the designs whose early plating sits far from the set's typical depth.
They can be corrected, or sent to a longer simulation. The programme's next step
is that decision rule, scored on DFN calls saved at a target tail error.

Limits: 24 to 28 designs per parameter set; the plating depth is a model
internal that a real cell shows only through a diagnosis; one law form; one
PyBaMM version; modelled fade only. Numbers are in
[`experiments/drift7c/results.txt`](../../research/cell-fidelity/experiments/drift7c/results.txt)
and the post hoc tail check is in
[`posthoc.txt`](../../research/cell-fidelity/experiments/drift7c/posthoc.txt).
