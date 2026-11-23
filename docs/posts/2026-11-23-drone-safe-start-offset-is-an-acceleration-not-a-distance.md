---
title: "A drone's safe start offset is an acceleration, not a distance: triple the position gain, a third of the step"
seo_title: "A drone's safe start offset is an acceleration, not a distance"
date: 2026-11-23
tags: [research, drones, codesign-cant, control, stability]
description: "Across 36 simulated quadrotor tunes with position gain 10 to 31, the start error a drone survives at a 45° tilt limit scales as 1/kp."
---

A [codesign-cant](../../research/codesign-cant/) run earlier today found
that quadrotor designs retrained for a 45° tilt-command limit have a basin
of attraction. Start them within about 0.47 m of their hover point and they
recover. Start them further out and some tip past 60° and crash. That run
offered a rule for builders: keep the first proportional request, position
gain times error (kp · |e|), below about 4.7 m/s². But every design it
tested had the same gain, kp ≈ 10 s⁻². A rule in m/s² and a rule in metres
made the same predictions there, so it could not say which one was right.
The difference matters: if the limit is a distance, a stiffer tune keeps
its safe step; if it is an acceleration, the safe step shrinks with the gain.

## The test

An earlier milestone (7l) had retrained 36 designs at a 45° limit. Twelve
of them were given a wider gain box and chose kp 21.7 to 31.5; the other 24
sit at 10. We flew all 36 without the acceleration cap, scaling each of 64
held-out flights' start offset along its own direction from 1 cm to 1 m
per axis (14 sizes, 18 s each), once with every other disturbance off and
once with everything on. Five predictions were committed before the code
was written, and all five held. The run took 179 s on four cores.

![Left: share of flights crashed against start-offset half-width for kp ≈ 10 and kp 22-31 designs. Right: each design's median critical half-width against its position gain on log axes, with the fitted slope -0.77 between the distance (0) and acceleration (-1) lines](../../research/codesign-cant/experiments/m7am_roa_kp/m7am_roa_kp.png)

## What it found

- **The basin's edge is an acceleration.** Pooled over 32,256 (design,
  flight, size) cases, kp · |e| separates crashes from survivors with an
  AUC of 0.985. The offset alone scores 0.910. Within a group of equal
  gains the two score the same, so the whole difference comes from the gain.
- **The critical offset scales as 1/kp.** Measured along each flight's
  direction, the per-design critical offset falls as kp to the power −1.06.
  The median request at which a flight first crashes is 7.40 m/s² at kp ≈ 10
  and 7.01 m/s² at kp 22 to 31. The gain triples and the critical request
  moves by 5%.
- **The 4.7 m/s² rule transfers, a little lower.** Of 25,249 starts below
  4.7 m/s², 26 crashed (0.1%). The smallest fatal request was 4.31 m/s².
- **The cap removes all of it.** Milestone 7l's cap bounds the same request
  at 3.5 m/s², below that floor. With it, the high-gain designs go from 463
  crashes of 768 to 0 at a 0.5 m start, and from 648 to 0 at 1 m.

## What a builder takes from it

For a tune at a 45° tilt limit, the safe takeoff or waypoint step is about
4.3 m/s² divided by the position gain: 0.43 m at kp 10, 0.14 m at kp 30. Or
clip the proportional term so its request never passes about 3.5 m/s². A stress test that fixes the start
offset in metres compares a soft tune at the foot of its curve with a stiff
one past its edge, so the offset should be reported as a request.

## Limits

This is one simulator. The designs come from one geometry pair, at lever 0,
on one held-out seed of 64 flights each. The offsets run along 64 fixed
directions, with no search for the worst one, and the grid brackets each
critical value rather than solving it. The gain takes two clusters of
values, not a continuum. The 45° limit, the 60° crash angle and the 3.5 m/s²
cap are inherited settings. The numbers are in
[`stats.txt`](../../research/codesign-cant/experiments/m7am_roa_kp/stats.txt),
the predictions and outcome in the programme's
[log](../../research/codesign-cant/LOG.md).
