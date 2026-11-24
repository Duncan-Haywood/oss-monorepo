---
title: "Two knobs, one crowd model: the fit lands on the dense end or the light end, not both"
seo_title: "Calibrating a pedestrian crowd model on real density data: two knobs"
date: 2026-11-24
tags: [research, society-lanes, pedestrian-dynamics, digital-twin, simulation]
description: "We fitted a collision-free speed crowd model's time gap and body radius to a real corridor experiment. It matched the dense run and missed the light one."
---

A robot that shares a corridor with people should be tested in a crowd model
that walks like people do. Our corridor twin is collision-free speed, a
JuPedSim crowd model, checked against the HERMES corridor experiments run at
Jülich in 2009. It reached the densest real run (1.72 people per m²) last
step. It was wrong in two ways, though. At 0.8 per m², adding a walker barely
slowed anyone down, and above 1.3 per m² people crossed too quickly.

This step tuned two knobs together: the model's **time gap** (how far ahead,
in seconds, a walker keeps clear) and the **body radius**. We ran a 5 × 4 grid
of 2,160 simulations, with nine predictions written down before any number
came back. Each pair was scored on how closely it matched the real
time-to-cross curve and on how closely its slope matched.

What came out:

- **The best pair is a long time gap with a thin body** (0.8 s and 0.15 m).
  On 16 fresh seeds it matches the dense run: **10.56 s to cross 8 m against
  a real 10.61 s**. Taking away 20% of the walkers saves +1.16 s, against a
  real +1.38 s (interval +0.96 to +1.85).
- **The light run comes out too slow.** At 0.84 per m² this twin takes 7.92 s
  where people took 6.55 s. The marginal walker still costs too little there:
  +0.18 s against a real +0.41 s.
- **Across the whole curve it does no better than the old one-knob twin**
  (curve gap 1.06 s against 1.01 s). That holds on held-out runs where people
  were told which exit to use as well.
- **Wider bodies jam instead of slowing smoothly.** With a radius of 0.25 m or
  more and a time gap of 0.3 s or more, the corridor clogs, and in the worst
  pair 32 of 108 runs saw no one cross.

Three of the nine predictions held: the replication check, and the two about
the dense end. The ones that failed say something about the model. Collision-free
speed keeps a walker at full speed until the gap ahead runs out. A setting that
slows people enough in a dense crowd therefore slows them everywhere, and no
setting makes them ease off early at moderate density, as real walkers do.

What we will use it for: robot experiments at the dense run's density can use
this twin, because there its level and its marginal cost both match the
real runs. At 0.8 per m² no setting we tried is good enough. That operating
point needs a model whose speed falls smoothly with spacing, and it is the
next step.

Code, data and the full results are in
[`research/society-lanes`](../../research/society-lanes/README.md); the
predictions and the outcome are in its research log.
