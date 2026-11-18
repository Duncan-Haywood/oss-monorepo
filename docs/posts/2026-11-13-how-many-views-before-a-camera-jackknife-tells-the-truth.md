---
title: "How many views before a camera's jackknife error bar tells the truth?"
seo_title: "Camera self-calibration error bars: jackknife vs view count"
date: 2026-11-13
tags: [research, sensing, camera-calibration, self-calibration, statistics, robotics]
description: "On 16,172 real view sets, the jackknife overstates focal-length error 7–8× at 4 views and 1.1–1.4× at 10; the solver's σ is 2–6× too small."
---

The [`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme is building a check a
robot can run before it trusts a camera calibration it worked out for itself, with no target. Such a
check needs an honest error bar on the focal length. The previous step
[found](2026-11-13-a-camera-cannot-set-its-own-threshold-from-seven-views.md) that error does not
fall as 1/n below about 5 views. It guessed that this is also why the leave-one-view-out jackknife
had looked far too cautious on 7-view sets. This step tests that guess.

## What we did

We [wrote four predictions down first](../../research/sensing-selfcal/LOG.md). Then we solved
target-free bundle adjustment on **every subset of 3 to 12 of the 13 views** of OpenCV's stereo
sample, on both cameras: 16,172 view sets, 10,854 of them new. For each set size we compared three
numbers:

- the **real** spread of the focal length, measured two ways (disjoint pairs of view sets, and every
  set against the all-view solve);
- the **jackknife** error bar, from re-solving with each view left out in turn;
- the **solver's own σ**, from its covariance matrix.

## What we found

| views in the set | 4 | 5 | 6 | 8 | 10 |
|---|---|---|---|---|---|
| jackknife / real, left camera | 6.7 | 3.0 | 1.6 | 1.3 | 1.1 |
| jackknife / real, right camera | 6.7 | 4.6 | 1.9 | 1.7 | 1.4 |
| solver σ / real, left camera | 0.17 | 0.23 | 0.23 | 0.24 | 0.24 |
| solver σ / real, right camera | 0.19 | 0.38 | 0.40 | 0.49 | 0.59 |

The guess holds. The jackknife's overstatement falls at every step on both cameras, from 7–8× at 4
views to 1.1–1.4× at 10. Most of the small-set excess comes from a few leave-one-out solves that
land near the critical geometry, where focal length is barely observable. The median-based
jackknife is "only" 2.4–4.1× at 4 views.

The solver's own σ goes the other way: 2 to 6 times too small at every size. On these unbiased
corners it is worse than the 2× we found at the start.

Two of the four predictions failed. The right camera needs about 10 views, not 8, before the
jackknife comes within 1.5×. And on that camera the two "real" references disagree by up to 1.7×,
so its views do not each add an independent error. That is a modelling assumption a paper has to
drop, not lean on.

## What it means for a robot

Below about 6 views, neither error bar is usable: the solver's is far too small and the
jackknife's far too large. With 10 or more logged views the plain jackknife is a usable, mildly
cautious error bar, with nothing borrowed from a sibling camera. Field robots log many more frames
than that, so the practical rule is to calibrate from a bigger window, not to invent a new
statistic. The limits are the usual ones: one stereo rig, one board, 13 views shared by every set.

Code, data and every number:
[`experiments/m4f_setsize`](../../research/sensing-selfcal/experiments/m4f_setsize/).
