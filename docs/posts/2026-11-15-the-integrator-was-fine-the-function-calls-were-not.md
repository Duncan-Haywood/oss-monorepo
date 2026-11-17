---
title: "The physics was fine; the function calls were the cost"
seo_title: "Speeding up a Python RK4 integrator 2.5x without changing a bit"
date: 2026-11-15
tags: [performance, python, simulation, open-tennis-robots]
description: "Inlining three hand-written RK4 loops cut the open tennis robots test suite from 160 s to 96 s with bit-identical results."
---

The [open tennis robots](https://marisstella.app/open-tennis-robots/) project
simulates a lot of physics in plain Python: ball flight with drag and Magnus
lift for the catch-net study, and the electrical start-up of the feeder (a
precharge resistor, then a contactor that bounces) for the CAD design rules.
Its test suite took 160 seconds on a 4-core container, and an agent changing
the robot waits for all of it.

A profile showed where the time went, and it wasn't the maths. One README
claim, "a 3 m net on a 2.5 m/s base catches 91% of 300 returns", re-ran 300
simulated rallies in 24 seconds. 10.8 of every 11.7 profiled seconds were
inside the RK4 step, which made 1.9 million calls to `acceleration()`, and
each of those built a dozen small tuples through `add`, `scale`, `norm` and
`dot`. The contactor model was the same shape: 65 million calls to a two-line
`deriv` helper.

So we wrote the steps out by hand: one closure per spin vector, with the
spin's norm and the drag and lift constants worked out once, not four times a
step. There was one constraint. The tests pin exact counts (274 of 300 caught,
not "about 91%"), so close answers weren't enough; the floats had to be
identical. That means keeping every operation in its original order and
grouping: `a * h / 2` stays `(a * h) / 2`, and the gravity vector's `0.0 +`
stays, because `0.0 + -0.0` is not `-0.0`. A new test compares the old and
new steps' `repr` on 2,000 random states, and a scratch check compared
200,000 more.

| | before | after |
|---|---:|---:|
| whole suite | 159.6 s | 95.5 s |
| 300-rally catch-net study | 23.8 s | 9.3 s |

This is the same lesson as [our almost-rewrite in
Rust](2026-10-20-we-almost-rewrote-it-in-rust.md): the cost was in how the
code was arranged, not the language it was written in. The run's notes,
including what's still slow, are in
`docs/history/ci-perf-2026-11-15-open-tennis-inline-integrators.md`.
