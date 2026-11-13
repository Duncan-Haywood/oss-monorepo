---
title: "A camera can't set its own recalibration threshold from seven views"
seo_title: "Camera self-calibration update test: why split-half thresholds fail below 5 views"
date: 2026-11-13
tags: [research, sensing, camera-calibration, self-calibration, statistics, robotics]
description: "Split-half thresholds from a 7-view calibration overstate focal-length spread 3–5×, because f's error does not shrink as 1/n below 5 views."
---

The [`sensing-selfcal`](../../research/sensing-selfcal/README.md) programme is building a test a
robot can run before it accepts a new camera calibration it worked out for itself. Last step,
[on unbiased corners](2026-11-13-a-smaller-corner-window-doubled-the-camera-tests-power.md), the
focal-length test caught a 2% change in 61% of trials. The catch was its threshold. That came from
a *sibling camera*, and it gave 11% false alarms on one of the two cameras. A fleet would rather
have each camera set its own threshold.

## The idea

A robot always keeps the views behind its current calibration. Split those 7 views into 4 + 3 (there
are 35 ways), solve each half, and see how far the two focal lengths land apart. If each view adds
its own small independent error, the spread shrinks as 1/n. That gives a prediction of how far an
honest new calibration should land from the old one, and nothing is borrowed from another unit.

We [wrote down five predictions](../../research/sensing-selfcal/LOG.md) first, then solved every
3- and 4-view subset of OpenCV's 13-view stereo set on three corner localisers (3,168 bundle
adjustments) and scored 14,040 accept/reject decisions.

## It is quiet, and deaf

The test almost never fires on an unchanged camera: 0.6% and 0.0% false alarms. It also almost
never fires on a changed one. It catches a 2% focal change in **0.8%** of splits, where the borrowed
threshold caught 61%. The split-halves predict an old-to-new spread of 1.94% and 2.62% of f. The real
spread is 0.67% and 0.50%, so they overstate it 2.9× and 5.2×. Three of the five predictions failed.
The two that held (few false alarms, few harmful adoptions) held only because the test stays silent.

## Why: small view sets are a different regime

After the failure we measured how the focal length's spread falls with the number of views, scaled
so 1/n would give a flat line. Per view, on the unbiased corners:

| views in the set | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|
| left camera | 3.29% | 2.15% | 1.68% | 1.67% | 1.55% |
| right camera | 5.21% | 2.17% | 1.35% | 1.04% | 0.95% |

From 5 views up the line is roughly flat. Below that the error rises steeply: 3 or 4 boards
seldom span enough orientations, and the solve sits near the critical configuration where focal
length is barely observable. A 3-view half carries 2 to 5 times the per-view error of a
7-view set, so the threshold it implies is far too wide.

## What it means for a fleet

A per-unit threshold is still the right goal, but its halves need at least 5 views each, so about
10 views behind the old calibration. Field robots log far more frames than that, so this asks for
a bigger old set, not a new method. Until then a threshold pooled over sibling units is the
only usable focal-length test. The limits still apply: one stereo rig and one board, 13 views
shared by every split, and a post-hoc explanation that the next step should test on its own
pre-registered data.

Code, data and every number: [`experiments/m4e_selfscale`](../../research/sensing-selfcal/experiments/m4e_selfscale/),
and the paper draft's Section 7 ([`paper/draft.md`](../../research/sensing-selfcal/paper/draft.md)).
