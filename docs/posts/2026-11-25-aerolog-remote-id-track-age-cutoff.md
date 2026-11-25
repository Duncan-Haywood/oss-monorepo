---
title: "Don't cap Remote ID track age, scale the radius with it: a cut-off costs drones 9 times more waiting"
seo_title: "Remote ID track age: cut-off vs age-scaled radius for drones"
date: 2026-11-25
tags: [research, uav, airspace, safety, remote-id]
description: "Scaling a drone's protection radius with Remote ID track age cuts its transit hold to a fifth; waiting past a track-age cut-off costs 9 times more."
---

Yesterday's step in the [`aerolog-scaling`](../../research/aerolog-scaling/)
programme found that [bursty Remote ID message loss](2026-11-24-aerolog-remote-id-bursty-loss.md)
is what costs a delivery drone's hold-until-clear rule. The rule makes a drone
wait before it climbs or descends through another operator's altitude layer.
When a building blocks the receiver for 30 s, the newest message from each
nearby drone is old, its dead-reckoned position is poor, and the protection
radius has to grow. We wrote that a procedure should "bound the time since a
track's last message". Today we priced that advice, and it does not hold up in
the form we gave it.

## Four ways to use an old track

All four rules meet the same target of 1e-7 collisions per flight hour, on the
same 48 New York layouts and the same stored hold curves. We assume one
receiver channel per drone, so a single shadow makes every track stale at once.

- **Fixed radius (FR):** one radius, sized for the whole spread of track ages.
- **Track-age cut-off (TC):** if the newest message is older than A_max, the
  receiver counts as blind and the drone waits for a fresh message. Fresh
  decisions use a smaller radius.
- **Age-scheduled radius (OR):** each track age gets its own radius, chosen to
  minimise the mean hold while meeting the target. **OR-W** may also wait at
  any age. The other rules are special cases of it.
- **OR-C:** OR-W, but no single decision may carry more than ten times the
  mean miss probability.

## What it costs

These are hold times per flight for a <1 m/s speed accuracy band with half
the messages lost, for 12 and 16 operators. Every figure is in
[`track_age_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/track_age_results.txt).

| mean burst | FR | 60 s cut-off | age-scheduled (OR-W) | capped (OR-C) |
|---|---|---|---|---|
| 30 s, today's demand | 0.773 / 0.635 s | 6.68 / 6.2 s | 0.171 / 0.148 s | 0.172 / 0.149 s |
| 100 s, today's demand | 14.1 / 11.1 s | 86.8 / 81.5 s | 1.29 / 1.05 s | 1.43 / 1.17 s |
| 100 s, ten times demand | 1.1e5 / 2.0e4 s | 89.9 / 83.1 s | 29.8 / 22.4 s | 31.3 / 24 s |

At today's demand a cut-off is the most expensive option. A blind receiver
waits however empty the sky is, and with 30 s bursts it is blind for a large
share of the time. The best cut-off on our grid was 300 s, which in practice
means no cut-off at all. Scaling the radius with age is the cheap option: a
small radius for fresh tracks, a larger one for old tracks. It cuts the hold to
about a fifth of FR's at 30 s bursts and a tenth at 100 s. Waiting only pays at
ten times the demand, or when speed reports are poorer than 1 m/s.

## The catch, and the fix

The unconstrained optimum meets the mean target by accepting more risk on the
oldest tracks. At 30 s bursts, 0.6% of decisions carry over ten times the mean
miss probability, and the worst carries 253 times. A regulator may reasonably
refuse to accept that. A per-decision cap at ten times the mean costs almost
nothing, about 1% at 30 s bursts and 11% at 100 s. So the rule worth writing
down is a protection radius that grows with track age, with a per-decision
cap. A maximum track age is not that rule.

## Limits

This is preliminary. Two predictions out of six were refuted. One was K1: the
best cut-off turned out to be "none". The other was K6: the age-scheduled
radius saves about 30% even at <0.3 m/s. The analysis freezes a track's age for
the length of a hold and gives each receiver one shared channel. Burst lengths
are swept, because we found no measured Remote ID burst-length data. The setup
and every claim are in the programme's paper, Section 6.10(f).
