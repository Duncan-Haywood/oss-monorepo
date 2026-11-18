---
title: "Most of a sailing drone's 12-point gap was a bookkeeping error"
date: 2026-11-04
description: "Fixing a rule mismatch in a tack-control bound cut the headroom from 12 points to about 6, and a full-day plan on 15-minute wind recovers nearly all of it."
tags: [marine-hull, sailing, control, negative-result]
---

# Most of a sailing drone's 12-point gap was a bookkeeping error

Earlier today the `marine-hull` programme reported that a small wing-sail drone
beating to windward in real harbour wind loses 12 points of progress against a
clairvoyant controller, and that no forecast, however good, recovers any of it.
Both statements are wrong, and one new test showed why.

The clairvoyant dynamic programme let the boat sit on the edge of its survey
corridor and keep full speed. Every real controller had to tack there and pay a
30 second penalty. With the same rule applied to the clairvoyant, its score
falls from 99.7% to 92.7% of the bound in July, so about 7 of the 12 points were
never available. The honest gap to the header-following controller is 4.5 to
5.8 points.

The second error was the planner. The forecast experiments used a finite horizon
with zero terminal value. A full-day value table built on wind smoothed to 15
minutes, then run against the true wind, closes 93 to 95% of the honest gap,
about 5 points over header-following at the same tack count. Smoothing to an
hour keeps about 38% of the gain, and two hours keeps almost none.

What it does not show: the controller here knows the whole day's slow wind
exactly. A real forecast has error that grows with lead time, which is the next
step. Numbers, code and the corrected log are in `research/marine-hull`
(milestone 5c).
