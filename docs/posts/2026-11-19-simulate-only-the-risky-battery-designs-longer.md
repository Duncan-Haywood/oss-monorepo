---
title: "Simulate only the risky battery designs longer: half the DFN cycles, most of the tail accuracy"
seo_title: "Battery design search: extend only the risky designs' DFN runs"
date: 2026-11-19
tags: [research, batteries, pybamm, lithium-plating, design-search]
description: "A ten-cycle drift score picks which battery designs to simulate to cycle 50. On two of four cells it keeps the tail accuracy for about half the cycles."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how cheaply
a lithium-ion electrode design search can run the full porous-electrode model
(DFN) and still rank designs on fade. One piece of that is a forecast: run
each candidate for ten cycles, fit a fade law, and read off how much lithium
it will have lost by cycle 99, mostly to lithium plating.

Earlier steps found two things. A line fitted through 50 cycles instead of
10 cuts the forecast's error by half or more. And a score you can compute at
cycle 10, built from where the plating sits in the anode, flags the designs
whose fade rate is about to drift away from the ten-cycle line. This step
puts them together: run every design for ten cycles, then run on to cycle 50
only the designs the score flags.

## What it saves

All numbers come from 104 PyBaMM DFN designs already simulated to cycle 99,
across four published parameter sets. Nothing new was simulated: the step
replays the decision on recorded runs. The target was the upper quartile of
the error over a set's designs, which is where a design search gets hurt,
within 1.25 times what extending every design to cycle 50 gives.

| Parameter set | Upper-quartile error, 10 / 50 cycles | Designs extended, drift score | Random flags | Hindsight oracle | DFN cycles saved (score) |
|---|---|---|---|---|---|
| `Chen2020` (LG M50) | 11.4% / 5.7% | 15% | 50% | 10% | 68% |
| `NCA_Kim2011` | 7.5% / 2.2% | 45% | 75% | 40% | 44% |
| `Ai2020` | 4.5% / 2.7% | 55% | 70% | 25% | 36% |
| `OKane2022` (LG M50) | 10.0% / 4.0% | 95% | 95% | 85% | 4% |

"Cycles saved" is against extending every design: 10 cycles each plus 40
more for each flagged one, against 50 each.

On `Chen2020` and `NCA_Kim2011` the score lands within one grid step (5% of
designs) of the oracle, which flags by the error each design actually turns
out to have. On `OKane2022` it saves nothing, and neither does the oracle,
because the tail there is spread over most of the designs: there is no small
risky group to find.

## The surprise

When every input to the fade law is measured rather than forecast, the error
left is the law's own drift, and the plain cycle-2 plating depth flags it
better than the fitted correction: on both LG M50 sets, extending 20% of the
designs meets the target, against 60% for the correction. For the real
forecast, where errors in the inputs add to the drift, the fitted correction
does better. Which score to use depends on what the error is made of.

## Limits

Each set has 24 to 28 designs, so the upper quartile is one design's error
and the fraction needed moves in whole designs. There is one tail target and
a 0.05 grid. The flags rank designs within a batch, so a live search can use
them only once that batch's ten-cycle runs are in. The plating depth is a
model internal that a real cell would show only through a diagnosis. All of
it is one PyBaMM version and modelled fade, not measured cells.

The hypotheses were written down and committed before the policy was run:
three supported, one inconclusive. The plan, the result and the code are in
the project's [log](../../research/cell-fidelity/LOG.md) and
[`experiments/triage7d/`](../../research/cell-fidelity/experiments/triage7d/results.txt).
