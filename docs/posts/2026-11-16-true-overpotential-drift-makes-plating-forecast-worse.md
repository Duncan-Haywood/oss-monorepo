---
title: "Feeding a battery fade forecast the true overpotential drift made it worse"
seo_title: "True overpotential drift made a plating forecast worse"
date: 2026-11-16
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Adding the overpotential's true 100-cycle drift worsened a ten-cycle lithium-plating forecast on 128 fresh PyBaMM designs, so the error is in the law."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts a
lithium-ion cell's 100-cycle lithium-plating loss from its first ten cycles, so
an electrode design search does not have to simulate all 100. The test bed is
PyBaMM's full DFN model with SEI growth and lithium plating, on four parameter
sets. The previous milestone got LG M50 (`Chen2020`, `OKane2022`) to within
about 10%. It did that by reading both levers of the plating law at the
charge window the cell actually reaches. That window is set by one effective
overpotential, &eta;, measured from the first ten cycles' charge capacity.
The same change made `Ai2020` worse, from 2.5% to 7.6%. The explanation
offered then was that `Ai2020`'s &eta; drifts over the 100 cycles while the
law holds it constant.

## Three ways to fix it, none of which worked

Milestone 5ze tested that explanation directly. It first tried three fixes on
the 384 designs earlier milestones had already simulated:

- **Follow &eta;'s ten-cycle trend.** The trend over-extrapolates. On LG M50
  it puts the cycle-99 &eta; 20 to 45 mV too low, and the LG M50 error rises
  from 6 to 10% to 15 to 18%.
- **Choose the reading per design.** Pick the open-circuit or the &eta;-window
  reading by which one predicts cycle 10 better from cycles 2 to 7. On `Ai2020`
  and `OKane2022` this picks the wrong one for most designs. The two readings
  only part after cycle 10.
- **Split &eta; in two.** A symmetric &eta; was an assumption. The mean
  discharge voltage (the discharge energy over the discharge capacity) fixes
  where the window sits as well as how long it is. So each design gets a
  discharge-side and a charge-side overpotential from data it already has.
  The charge side came out within a few millivolts of the symmetric value, and
  the forecast barely moved.

The fourth check was the telling one. It is an oracle, not a forecast: give
the law the &eta; the cell really needs at cycle 99. If drift were the
problem, this would fix it. It made the forecast worse on every seen pool.

## The fresh test

The milestone did not propose a new law. It pre-registered five claims about
these findings and ran 128 new designs to check them: a new random seed, and
currents no earlier milestone had used. All five held.

| pool | open circuit (5zc) | &eta; window (5zd) | split &eta; (5ze) | true drift (oracle) |
|---|---|---|---|---|
| `Ai2020@0.6125x` | 2.4% | 6.3% | 5.9% | 11.1% |
| `NCA_Kim2011@0.5625x` | 1.3% | 2.3% | 2.3% | 4.0% |
| `Chen2020@1.28125x` | 19.1% | 10.9% | 10.2% | 15.5% |
| `OKane2022@1.3125x` | 16.0% | 9.5% | 9.3% | 12.6% |

The figures are the median absolute log error of the predicted cycle-99
lithium loss, 32 designs per pool. The LG M50 result from 5zd replicates. The
split overpotential's charge side is within 1 to 5 mV of the symmetric one,
and the discharge side is about a third lower. The oracle loses on all four
pools.

## What it means

The overpotential is measured correctly. Measuring it better, or even knowing
its future, does not help, so the remaining error is in the structure of the
law. On LG M50, a constant &eta; appears to make up for something the law
leaves out. The leading candidate is the plating kinetic exponent, which the
law takes from one parameter set and applies to all four. The next milestone
estimates it per design from the same ten cycles.

The same caveats apply as before: one current per set, one PyBaMM version
(26.10.1.1), and modelled fade, not measured cells. The code, the 128-run
bench and the pre-registration are in the
[project directory](../../research/cell-fidelity/) and its research log.
