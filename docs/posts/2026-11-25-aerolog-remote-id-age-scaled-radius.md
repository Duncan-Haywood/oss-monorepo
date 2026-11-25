---
title: "Scale the drone's Remote ID protection radius with track age: a fifth of the hold at 30 s shadows"
seo_title: "Remote ID track age: an age-scaled radius for drone holds"
date: 2026-11-25
tags: [research, uav, airspace, safety, remote-id]
description: "A protection radius that grows with Remote ID track age cuts a drone's transit hold to a fifth of one fixed radius, once the burst law is known."
---

The [`aerolog-scaling`](../../research/aerolog-scaling/) programme has been
pricing a hold-until-clear rule. The rule makes a delivery drone wait before
it climbs or descends through another operator's altitude layer, until no
other drone is predicted within a protection radius. Over broadcast Remote ID,
the newest message from each nearby drone can be old, because a building
blocks the receiver for tens of seconds at a time. Yesterday's step
[compared two ways to handle that](2026-11-24-aerolog-remote-id-maximum-track-age.md).
One is a single radius sized for every track age. The other is a maximum
track age: a drone that has heard nothing for longer than the cut-off waits.

Under geometric bursts the fixed radius was about 3.5 times cheaper. But its
collision guarantee depends on the shape of the burst-length tail, which
nobody has measured for Remote ID. The cut-off's guarantee does not. This step
asks what lies between the two: a radius that depends on how old each track is.

## The rules compared

All rules meet the same target of 1e-7 collisions per flight hour. They run on
the same 48 New York layouts, the same stored hold curves and the same
geometric bursts, with one receiver channel per drone, so a single shadow
makes every track stale at once.

- **Fixed radius (FR):** one radius for all ages.
- **Age-scheduled radius (OR-W):** each track age gets its own radius, chosen
  to minimise the mean hold. The drone may also wait for a fresh message at any
  age. FR and the cut-off are special cases of this rule.
- **Capped schedule (OR-C):** the same, but no single decision may carry more
  than ten times the mean miss probability.

## What it costs

These are hold times per flight for a <1 m/s speed accuracy band with half
the messages lost, for 12 and 16 operators. Every figure is in
[`track_age_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/track_age_results.txt).

| mean burst | fixed radius | age-scheduled (OR-W) | capped (OR-C) |
|---|---|---|---|
| 30 s, today's demand | 0.773 / 0.635 s | 0.171 / 0.148 s | 0.172 / 0.149 s |
| 100 s, today's demand | 14.1 / 11.1 s | 1.29 / 1.05 s | 1.43 / 1.17 s |
| 100 s, ten times demand | 1.1e5 / 2.0e4 s | 29.8 / 22.4 s | 31.3 / 24 s |

Using a small radius for fresh tracks and a larger one for old tracks cuts the
hold to about a fifth at 30 s bursts and a tenth at 100 s. Even the
best speed band (<0.3 m/s) saves about 30% at 30 s bursts. Waiting only becomes part of the
optimum at ten times the demand, or when speed reports are poorer than 1 m/s.

## The catch

The unconstrained optimum meets the mean target by accepting more risk on the
oldest tracks. At 30 s bursts, 0.6% of decisions carry over ten times the mean
miss probability, and the worst carries 253 times. Capping every decision at
ten times the mean costs almost nothing: under 1% more hold at 30 s bursts and
11% at 100 s.

The bigger catch comes from yesterday's step. The schedule is sized for an
assumed burst law, just as the fixed radius is. If the real tail is heavier,
the schedule is no more certifiable than one radius is. So the recommendation
has two stages. Until a receiver's burst-length law is measured, certify the
cut-off. After it is measured, carry a capped age schedule. Combining the two,
an age schedule under a certified cut-off, is the next step. This step does
not price it.

## Limits

This is preliminary. 4 of 6 pre-registered predictions held. The analysis
freezes a track's age for the length of a hold, gives each receiver one shared
channel and models geometric bursts only, with burst lengths swept. Every
number in the programme's paper, Section 6.10(g), is checked against the
results file.
