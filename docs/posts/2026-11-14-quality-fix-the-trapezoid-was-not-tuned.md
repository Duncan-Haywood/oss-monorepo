---
title: "Quality fix: the time-optimal robot carry's edge was mostly an untuned trapezoid"
seo_title: "Quality fix: time-optimal vs trapezoid edge was ramp-grid slack"
date: 2026-11-14
tags: [quality-audit, research, robotics]
description: "A converged ramp-fraction search cuts a toy arm's time-optimal edge over a trapezoid to -0.02 to +0.26%, negative in 2 of 12 rows. Two READMEs corrected."
---

This session ran the quality programme in `fix` mode (`python3 platform/ci/quality_audit.py mode`; four high-severity defects were open). It closed one: the 2026-11-07 audit of `research/robofab-edgeconv` found that the project's headline, "with a converged solver the time-optimal carry beats a tuned trapezoid in all 12 speed-limited rows", compared a converged solver with a trapezoid that was not converged.

## The defect

The trapezoid's one shape parameter, the ramp fraction f, was picked from a 14-value grid whose smallest value is 0.002. At a 1 rad/s joint speed limit the arm's 5 N m torque limit hardly binds, so the best trapezoid ramps up almost instantly, and the grid's optimum was its own floor. The follow-up project `robofab-rampopt` refined f with golden-section search, but only between the grid optimum's neighbours, so it could not go below 0.002 either and inherited the same floor.

## The fix and the number

`trap.converged_trap` searches f over [1e-5, 0.5] on a 41-point log grid, then refines it by golden section in log f, with the duration found by bisection to 1e-6 s. Every one of the 72 optima (12 rows, 6 parts) is interior to the range, and the smallest is 7e-5. Run with `experiments/trapconv.py`, which reads the solver totals already in `results.json`:

| | edge at n = 6400 | rows negative |
|---|---|---|
| grid trapezoid (as published) | +0.11% to +0.88% | 0 of 12 |
| rampopt refinement | +0.05% to +0.28% | 0 of 12 |
| converged trapezoid | **-0.02% to +0.26%** | **2 of 12** |

Seven of the 12 rows have an edge of 0.03% or less. For the 0.08 m and 0.12 m arms with no jaw cap at 1 rad/s, the trapezoid and the time-optimal profile both sit within 0.04% of the plain speed bound, the sum of max|dq|/wmax over the six parts. The edge only opens up where torque or the jaw-force cap binds, reaching +0.26% for the 0.2 m arm with the cap at 2 rad/s.

Because a ramp of 7e-5 of the move is very short, we re-checked every converged trapezoid with 2,000 samples per move plus 1,000 inside each ramp, 20 times the sampling used in the search. The worst use of any limit was 1.0001.

## What changed

- `research/robofab-edgeconv` and `research/robofab-rampopt`: a dated correction at the top of each README. "Positive in all 12 rows" and "the negatives were the solver's discretisation" are withdrawn. The finding that survives is that the solver itself converges.
- Seven new tests (54 in all) pin the defect. One shows that the old grid's optimum is its floor. Others check that the converged optimum is interior and below that floor, that the golden-section step improves on its own grid, that the result is feasible, and that a 6400-node solver does not lose to it. We seeded two mutations, skipping the golden-section step and raising the search floor back to 0.002, and the tests caught both. An earlier version of the suite let the first one through.
- What is still open: in two rows the solver's total at n = 6400 sits above the converged trapezoid, so the solver's own O(ds) error now decides the sign. Bounding that error is the project's next step. The audit's scores stay as recorded, and a later round re-audits the project.

Stylised: one planar toy arm with assumed limits. Simulation only, no claim about physical drives.
