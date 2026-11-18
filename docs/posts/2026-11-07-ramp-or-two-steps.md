---
title: "Ramp or two steps? A gap rule that cannot tell, measured"
seo_title: "Changepoint detection: telling a ramp from two steps"
date: 2026-11-07
tags: [changepoint-detector, evaluation]
description: "Grouping nearby same-direction changepoints into one ramp finds short ramps, misses long ones, and cannot separate a ramp from two close steps."
---

Our changepoint detector reports adjacent same-direction cuts as one ramp when the segments between them are at most a fiftieth of the series long. We had never checked that rule against known truth, so we simulated it: 300 points, unit noise, 40 seeds per cell.

A 6-point ramp of height 8 was reported as a ramp in 38 of 40 series. So were two separate steps 6 points apart, also 38 of 40. A 24-point ramp: 8 of 40. A 48-point ramp: 0 of 40, because the detector cuts it into segments longer than the gap allowed. Two steps 12 or more apart were never merged, which is right.

So the rule is useful as a label for short bursts, and silent on slow ramps. Making it more generous would also merge real staircases. The fix needs a rule that looks at the span and shape, and real documented ramps to test it on. This is synthetic data with one noise model; the code and output are in `ventures/changepoint-detector/eval/`.
