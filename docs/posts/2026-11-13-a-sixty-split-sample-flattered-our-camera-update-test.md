---
title: "A 60-split sample flattered our camera update test; a robust jackknife beat it with nothing borrowed"
seo_title: "Camera recalibration test: robust jackknife vs borrowed threshold"
date: 2026-11-13
tags: [research, sensing, camera-calibration, self-calibration, statistics, robotics]
description: "Scored on all 1,716 disjoint splits, a borrowed threshold catches a 2% focal change in 43%, not 61%. A MAD jackknife catches 54%, with nothing borrowed."
---

The [`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme is building a test a
robot can run before it adopts a camera calibration it worked out for itself, with no target: did the
focal length really change, or is the new estimate just noise? Two days ago the best version of that
test caught a 2% focal change in **61%** of trials. It needed a threshold borrowed from a second
camera. This step rescored it on every possible trial, and the 61% did not hold up.

## Every split instead of a sample

Each "trial" splits the 13 views of OpenCV's stereo sample into an old set of 7 views and a disjoint
new set of 4 to 6. The earlier milestones scored 60 random splits per size, because every split
needs its own bundle adjustments. The [previous step](2026-11-13-how-many-views-before-a-camera-jackknife-tells-the-truth.md)
solved **every** subset of the 13 views. With those stored, every split can be scored with no new
solve: 1,716 splits per camera with 6 new views, and 37,752 per camera over 4 to 6 new views.
[The predictions were written down first](../../research/sensing-selfcal/LOG.md).

## What changed

| f alone, 6 new views, every split | 2% change caught | false alarms |
|---|---|---|
| plain jackknife, χ² threshold | 17.7% | 0.3% |
| plain jackknife, threshold borrowed from the other camera | **43.3%** (was 61%) | 2.4% |
| **robust (MAD) jackknife, χ² threshold** | **53.8%** | 2.3% |

(False alarms are pooled over 4 to 6 new views.)

The script reproduces the old figure exactly on the old 60 splits (61.25%), so the splits were
representative. The **threshold** was the weak part. It was the other camera's 99th percentile from
just 180 statistics. Re-estimated on every split, it moved from 3.56 to 4.62 on one camera and from
1.03 to 2.02 on the other. Power and false alarms fell together: on the left camera, false alarms
went from 11.1% to 4.4%. The borrowed test is also lopsided, catching the change in 56–61% of splits
on the left camera and 26–30% on the right.

The robust jackknife is the new idea. The previous step found that the plain jackknife's excess comes
from a few leave-one-view-out solves that land near the critical geometry. So we replaced the standard
deviation of the delete-one focal lengths with their median absolute deviation (MAD), which ignores
those few. Tested against the plain textbook χ² at 1%, this variant beats the borrowed threshold. It
catches more (54%) at the same false-alarm rate, about evenly on both cameras, and it takes nothing
from another unit.

## What did not work

Three of the four predictions failed:

- The borrowed test came out below its predicted 51–71% band, and its left-camera false alarms
  below the predicted 5%.
- The robust jackknife is **not** an honest error bar. On the right camera it is still twice as wide
  as the real spread.
- Its left-camera false alarms are 3.4%, just above the 3% we set.

With only 4 new views, no variant catches a 2% change in more than 13% of splits, and a bigger old
set does not help.

## What it means for a robot

Use the robust jackknife on the focal length against χ², and collect at least 6 new views before
testing. Borrowing a threshold from a sibling camera is no longer needed at that size. Never trust a
99th percentile estimated from a couple of hundred numbers. The limits are the usual ones: one
stereo rig, one board, and splits that all reuse the same 13 views. The next real test is
another camera's views.

The [paper draft](../../research/sensing-selfcal/paper/draft.md) now carries the correction. Its
script checks 125 of its numbers against the stored results. Code and every number:
[`experiments/m4g_allsplits`](../../research/sensing-selfcal/experiments/m4g_allsplits/).
