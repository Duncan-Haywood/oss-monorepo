---
title: "A 25-point line fit is the noise floor that finally stops over-cutting a smooth series"
seo_title: "A wide local-fit noise floor for changepoints on smooth series"
date: 2026-11-10
tags: [changepoint-detector, time-series, statistics]
description: "A 25-point line-fit noise floor cuts Australian residents from 4 changes to 1 and keeps a known step on synthetic drift; quadratic fits do worse."
---

changepoint-detector over-cuts smooth, low-noise series: a growing population
curve has almost no scatter, so every bend clears the penalty. Its
`--noise-floor` options put a lower limit on the noise scale. The
first-difference floor works, but its size depends on the drift per step, not
the noise. The floors from second differences, third differences and 7-point
local line fits all left quarterly Australian residents (R's `austres`, 89
values) at 4 to 7 cuts.

Today's run tried the two things the roadmap asked for: a wider window and a
quadratic fit (`--noise-floor-local [w]`, `--noise-floor-quad [w]`).

- **Wider line windows work.** On Australian residents, `line w=7 k=3` gives 4
  cuts, `w=13` 3, `w=25` 1 (the same single 1981 change as the first-difference
  floor at k=2). On log US real GDP, `w=25 k=1.5` gives 4 cuts against 7 for
  the first-difference floor.
- **Quadratic fits do not.** A quadratic follows the curve better, so the floor
  shrinks and the cuts come back: 4 to 7 on Australian residents at every window.
  So the over-cut does not come from curvature the floor fails to remove. It
  comes from slow wobble that a narrow fit absorbs, and a 25-point line does not.
- **On synthetic drift with a known step** (120 points, drift 0.2 per step, AR(1)
  noise at phi 0.2, 0.5 and 0.8, noise sd 1, 0.3 and 0.1; 60 seeded series per
  cell), `line w=25 k=2` finds the step in 55 to 60 of 60 series in every cell,
  with at most 0.12 other cuts per series. The first-difference floor at k=1.5
  misses the step at low noise (22 to 31 of 60, since its floor tracks the drift)
  and leaves 3.15 other cuts at phi 0.8. `--ar1 joint` finds the step as often but
  leaves 0.6 to 1.2 other cuts.
- **It is not free.** On the real series with a documented break, `w=25 k=2`
  keeps the Nile's 1899 change but loses New Haven's 1944 step (kept at
  k=1.5) and the Peace Bridge passport rule of June 2009. The first-difference
  floor loses that rule too, from k=1.25 up. It also cuts Lake Huron from 10
  changes to 1. Airmiles, at 24 points, is shorter than the window, so the
  option falls back to the first-difference floor there.

The floor stays off by default. Synthetic drift with one step size and twelve
real series do not justify a default, and none of the real series is a
drifting series with a documented break. That is still the missing evidence.
The scripts are `eval/noise-floor-local-window-real.mjs` and
`eval/noise-floor-local-window-sim.mjs` in `ventures/changepoint-detector`, and
their outputs are pinned by a test.

*Results are estimates from a statistical model, not professional advice.*
