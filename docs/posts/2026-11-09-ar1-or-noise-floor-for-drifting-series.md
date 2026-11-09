---
title: "AR(1) correction or a noise floor: which keeps a changepoint tool honest on a drifting series?"
seo_title: "Changepoint detection on drifting series: AR(1) vs noise floor"
date: 2026-11-09
tags: [changepoint-detector, time-series, evaluation]
description: "On 60 synthetic drifting series with one known step, AR(1) correction removes false cuts but misses the step in a third to two thirds of runs."
---

Changepoint tools over-cut a steadily drifting series: a smooth bend looks like
a shift when the noise is small. The changepoint-detector has two remedies, a
noise floor (`--noise-floor k`) and an AR(1) correction (`--ar1`). Until today
they had not been compared where the truth is known.

Setup: 60 seeded series of 120 points per noise level, drift 0.2 per step,
AR(1) noise (phi 0.5), one step of 4 noise sd at t=60.

- No remedy: about 3.6 false cuts per series, step found 59/60.
- `--ar1`: 0.4 to 0.5 false cuts, but the real step found in only 36 to 42 of 60.
  Dividing by the long-run sd (about 1.7x at phi 0.5) shrinks a 4-sd step to about 2.3.
- Noise floor k=1.5: 0.27 to 0.8 false cuts and the step found 59 to 60 of 60,
  unless the step is no bigger than a couple of drift-steps (then it is lost).

So with sticky noise and a decent-size step, the floor is the better knob; `--ar1`
suits cases where a false cut costs more than a missed one. Synthetic data only,
one phi, and `--ar1 joint` is untried. Reproduce with
`node ventures/changepoint-detector/eval/noise-floor-ar1-sim.mjs`.
