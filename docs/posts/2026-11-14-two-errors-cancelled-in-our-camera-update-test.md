---
title: "Two errors cancelled in our camera update test; with an honest reference it catches 19%, not 54%"
seo_title: "Robust jackknife test for camera self-calibration: the right reference"
date: 2026-11-14
tags: [research, sensing, camera-calibration, self-calibration, statistics, robotics]
description: "A MAD jackknife against χ² seemed to catch a 2% focal change in 54% of cases. Its cut-off is too lenient; a model cut-off gives 19% at 0.2–0.5% false alarms."
---

Yesterday the [`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme reported its
best test yet. A robot recalibrates its own camera without a target. Before it adopts the new focal
length, it should ask whether the lens really changed or the estimate is just noise. The test
[caught a 2% focal change from 6 new views in 54% of trials](2026-11-13-a-sixty-split-sample-flattered-our-camera-update-test.md)
at 2.3% false alarms, and it borrowed nothing from another camera. This step asked whether the
yardstick behind that number was right. It was not.

## The question

The test divides the squared change in focal length by a variance. That variance comes from a
*robust* jackknife: re-solve the calibration with each view left out, then take the median absolute
deviation (MAD) of those focal lengths. The result is compared with the textbook χ² cut-off for 1%
false alarms, 6.63. But χ² assumes the variance is known. A MAD of 6 or 7 numbers is itself very noisy,
so the statistic should often land far above 6.63 by chance.

How far? Suppose each view adds its own independent error to the focal length. Then the statistic's
distribution depends only on how many views are in each set, not on the camera, so a robot can work out
the right cut-off by simulation in about a second. We wrote the predictions down
[before running it](../../research/sensing-selfcal/LOG.md).

## What came out

- The right 1% cut-off is **18.45** with 7 old and 6 new views (25.84 with 4 new), not 6.63. Under that
  model, χ² would give **6.1%** false alarms, not 1%.
- On the real views χ² gave 2–3%, but only because the robust jackknife still overstates the real
  spread at these sizes. One error hid the other.
- With the model's cut-off, the test stays quiet on both cameras (**0.45% and 0.20%** false alarms) and
  catches a 2% focal change in **18.6%** of splits.

| focal length alone, 6 new views, every split | 2% change caught | 4% change caught |
|---|---|---|
| robust jackknife, χ² cut-off (yesterday) | 53.8% | 92–94% |
| robust jackknife, model cut-off | **18.6%** | 66–75% |
| plain jackknife, model cut-off | 8.6% | |

All three predictions held. The robust scale still helps: with a properly derived cut-off it catches
twice as many changes as the plain jackknife.

## Why it matters beyond this rig

The cancellation is a property of this small view set, not of the method. The model says χ²
stays too lenient for this test even with large sets: 3.8% false alarms at 10 + 10 views and 2.2% at
20 + 20. Meanwhile the jackknife's overstatement fades as sets grow
([an earlier step](2026-11-13-how-many-views-before-a-camera-jackknife-tells-the-truth.md)). So a robot
that logs more views would see the χ² version's false alarms creep up, unnoticed. The model cut-off has
no such trap. It is conservative here because small view sets misbehave, and it would sit near 1% on a
camera whose views really do add independent errors.

For a fleet, the choice is now explicit. Either use the model cut-off and accept about 19% power at 6
new views. Or use χ² as an approximately 2–6% test and check its real rate on each unit. The gap
between 19% and the 43% of a threshold borrowed from a sibling camera is the price of borrowing
nothing.

## Limits

One stereo rig, one board, and 13 views shared by every split, so no interval is given. The model
leaves out the near-critical behaviour of small sets that earlier steps found. The next test needs a
camera with more views per set, rendered or captured.

The [paper draft](../../research/sensing-selfcal/paper/draft.md) now carries the correction, and its
script checks 142 of its numbers against the stored results. Code and numbers:
[`experiments/m4h_modelref`](../../research/sensing-selfcal/experiments/m4h_modelref/).

*Written with AI assistance (Claude Code).*
