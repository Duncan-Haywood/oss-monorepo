---
title: "Fitting a battery fade law on more cycles fixes its inputs, not the law"
seo_title: "Battery plating forecast: longer fit windows fix inputs, not the law"
date: 2026-11-19
tags: [research, batteries, cell-fidelity, pybamm, lithium-plating, forecasting]
description: "On 104 PyBaMM DFN cell designs, a 50-cycle fit barely moves the all-measured plating-law error on LG M50 cells; the gain goes to the forecast's inputs."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how early a
battery design search can trust a cheap forecast of lithium lost to plating.
Its forecast runs ten simulated cycles, feeds a rate law the anode's rising
potential, and extrapolates a straight line in the law's integral R(L) out to
cycle 99. Yesterday's step ([milestone 7a](2026-11-19-a-battery-forecasts-error-budget-held-out.md))
found that on fresh LG M50 designs, even with every input to the law
*measured* rather than forecast, the forecast still missed by 3.2 to 3.4%.
That remainder belongs to the law itself.

So today's step (milestone 7b, pre-registered before any new number was
computed) asked two things on all 104 PyBaMM DFN designs the programme has
simulated with full spatial detail:

1. Does the law's floor fall if the line is fitted on 15, 20, 30, 40 or 50
   cycles instead of 10?
2. Does a curved term with its curvature borrowed from the same cell's other
   designs close the floor at ten cycles?

## What came out

| set (n) | all measured, 10 cycles | all measured, 50 cycles | real forecast, 10 | real forecast, 50 |
|---|---|---|---|---|
| `Ai2020` (24) | 8.3% | 2.0% | 2.5% | 1.0% |
| `Chen2020` (28) | 1.8% | 1.6% | 5.6% | 2.7% |
| `OKane2022` (28) | 1.9% | 1.4% | 6.7% | 2.1% |
| `NCA_Kim2011` (24) | 1.1% | 0.7% | 4.0% | 1.4% |

These are set medians of |ln(predicted / simulated)| lithium loss at cycle 99
([results](../../research/cell-fidelity/experiments/lawfloor/results.txt)).
On the two LG M50 parameter sets the all-measured floor hardly moves, while
the real forecast's error falls by a factor of two to three. The earlier
advice to "fit through 30 to 50 cycles" was right, but for a different reason
than it seemed: a longer line averages out errors in the forecast inputs. It
does not repair the law.

The borrowed curvature did not help on LG M50 either: it beat the straight
line on 15 of 28 and 5 of 28 designs. A free quadratic fitted to ten cycles was
worse than the line on every set, as the plan expected.

## Why: the law is nearly straight, per design

A descriptive check made after the verdicts
([post hoc](../../research/cell-fidelity/experiments/lawfloor/posthoc.txt))
shows why. With measured inputs, a single straight line through all of cycles
2 to 99 leaves only 0.3 to 0.5% error, so R(L) really is close to linear in
cycle number. At the set median, the slope over cycles 51 to 99 is 0.99 times
the slope over cycles 2 to 10. But the per-design spread is about ±5 to 10%
(interquartile range 0.90 to 1.03 on `Chen2020` and 0.89 to 1.05 on
`OKane2022`), and the drift goes up for some designs and down for others. A
bend borrowed from other designs can't know which way a given design drifts,
and a ten-cycle line can't see it.

`Ai2020` is the exception. Its R speeds up by about a quarter over the run on
every design (interquartile range 1.24 to 1.34). That shared bend is why
measured inputs looked *worse* than forecast ones on this set in earlier
steps. Borrowing the bend cuts its all-measured error from 8.3% to 4.8%, and
it beat the line on 23 of 24 designs.

## What it means for a design search

- On LG M50-like cells, expect a ten-cycle plating forecast to keep an error
  of about 2 to 3% even with perfect inputs. Fitting more cycles is still the
  best fix for the real forecast, because it repairs the inputs.
- On cells whose law visibly accelerates across designs (here `Ai2020`), take
  the curvature from a few fully simulated designs.
- A free curve fitted to ten cycles is worse than a straight line.

Pre-registered hypotheses: H261 supported, H263 inconclusive, H260, H262 and
H264 refuted (the [log](../../research/cell-fidelity/LOG.md) has the plan and
the numbers). Limits: one law form and one rate constant, model internals as
inputs, one PyBaMM version, and modelled fade only. These are simulations,
not measured cells. Code: [`experiments/lawfloor/run.py`](../../research/cell-fidelity/experiments/lawfloor/run.py),
stdlib only, about 15 seconds.
