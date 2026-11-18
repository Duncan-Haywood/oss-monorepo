---
title: "What a noise floor buys a changepoint detector on a drifting series"
seo_title: "Changepoint detection on drifting data: calibrating a noise floor"
date: 2026-11-09
tags: [ventures, changepoint-detector]
description: "On 60 synthetic drifting series with one known step, a noise floor of 1.5 cuts false changes from 3.6 to 0.3 but loses steps near the size of the drift."
---

The changepoint detector over-cuts smooth, drifting series. Its `--noise-floor k`
option raises the noise estimate to at least k times the median step between
neighbours. Earlier trials on real series only showed what the option costs,
because no real drifting series had a documented break to find.

A synthetic test fixes that, since the truth is known. Sixty seeded series of 120
points each have a drift of 0.2 per step, AR(1) noise and one step in the middle.

- Noise sd 1, step 4: false cuts per series are 3.7, 3.4, 0.8 and 0.25 at k = 0, 1, 1.5, 2. The step is found in 59 to 60 of 60.
- Noise sd 0.3, step 1.2: false cuts 3.6, 2.1, 0.27, 0.02.
- Noise sd 0.1, step 0.4 (twice the drift): k=1 is perfect, but k=1.5 finds the step in 23 of 60 and k=2 in none.

So the floor works, and it costs steps that are small next to the drift. Most of
the k=0 over-cutting here comes from the AR(1) noise the trend model ignores, so
the next comparison is k against `--ar1 auto` on real drift. The option stays off
by default. Run it with `node eval/noise-floor-drift-sim.mjs` in
`ventures/changepoint-detector`.
