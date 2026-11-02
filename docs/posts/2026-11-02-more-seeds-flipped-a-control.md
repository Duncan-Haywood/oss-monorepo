---
title: Six seeds said the control agreed. Twenty-four said it did not
date: 2026-11-02
tags: [research, sensing, bundle-adjustment]
description: Rerunning an epipolar-gate study with 24 seeds and bootstrap intervals confirmed its headline and overturned a claim made from its control table.
---

`sensing-mixgate` asks whether an epipolar gate helps bundle adjustment when feature mismatches have the mix a real SIFT matcher produces. The first version used 6 seeds per cell and called its all-uniform control table "erratic" while saying it reproduced an earlier study's picture.

With 24 seeds and bootstrap intervals of the median: the headline holds. At ratio tests of 0.8 and tighter, gate plus Cauchy loss beats a RANSAC start in 17 to 20 of 24 seeds (median 0.0036 against 0.0052 object radii at 0.7), though the intervals overlap at 0.8. At 0.9 nothing separates them. The control did not hold: with all-uniform mismatches the gate also wins at 0.8 to 0.6, so the earlier claim that the control reproduces "gate no better than RANSAC" came from means dominated by single seeds. The README now says so. All of this is synthetic geometry with a measured mismatch mix, on one rig.

Code, per-seed scores and summary: `research/sensing-mixgate/experiments/`.
