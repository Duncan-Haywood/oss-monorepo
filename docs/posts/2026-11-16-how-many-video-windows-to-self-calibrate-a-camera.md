---
title: "How many seconds of video does a robot camera need to self-calibrate its focal length to 2%?"
date: 2026-11-16
tags: [sensing-selfcal, camera-calibration, robotics, uncertainty, meta-analysis, pre-registration]
seo_title: "How much video a camera needs to self-calibrate to 2%"
description: "Pooling 1.2 s windows of TUM RGB-D video: a random-effects pool keeps the error bar honest, independence overclaims 2.8x, and 2% takes about eight windows"
---

The `sensing-selfcal` programme asks whether a robot camera can recover its own focal length from the features it tracks, with no checkerboard, and whether it knows when the answer is wrong. The [previous step](../../research/sensing-selfcal/LOG.md) found an honest error bar for one 1.2 s window of hand-held video: re-solve the bundle adjustment twelve times, leaving out one keyframe each time, and take the spread. That bar is honest, but it is wide, a median 6.4% of f. So a robot has to pool windows. This step asked how many, and how to pool them without lying about the precision.

**What we did.** No new solves. We took the 57 windows the last step scored on three TUM RGB-D sequences (fr1/desk, fr1/xyz and fr3/structure-texture-far), each with its focal length and its jackknife sd. We slid blocks of K consecutive windows along each sequence and pooled each block three ways. The first treats windows as independent (an inverse-variance mean). The second is a DerSimonian–Laird random-effects mean, which adds the spread between windows to each window's own variance. The third is the plain median. Five predictions were committed to the log before the script first ran. Each pooled f is scored against the camera's checkerboard calibration.

**What came out.**

| Windows pooled (video) | rms z, independent | rms z, random effects | median sd of f | median error of f |
|---|---|---|---|---|
| 1 (1.2 s) | 1.76 | 1.76 | 6.45% | 5.25% |
| 3 (3.6 s) | 2.55 | 1.28 | 4.14% | 3.76% |
| 5 (6 s) | 2.79 | 1.10 | 3.31% | 2.45% |
| 8 (9.6 s) | 2.90 | 0.89 | 2.53% | 1.42% |

An rms z of 1 means the error bar matches the real error. Pooling as if windows were independent claims nearly three times the real precision, and the overclaim grows with every window added. Windows share a scene, a session and part of their error, so averaging does not remove it. The random-effects pool measures that shared spread and stays honest at every block size. Two of the five predictions held. The other three failed:

- **The median of five windows was not within 2% on fr3.** It reached 1.5% on fr1/desk and 2.3% on fr3. On fr1/xyz, the near-critical sequence where the camera mostly translates, it was 3.0%, as predicted.
- **Five windows rarely give a usable answer.** The bar was a random-effects sd and an error both at or under 2%. Only 45% of fr1/desk blocks met it, and none on fr3 or fr1/xyz.
- **A rotation gate does not find the near-critical case.** Dropping windows that rotate less than 5° (read from motion capture, as a gyro would read it) kept 15 of 18 fr1/xyz windows. It also threw out more than half of fr3's slow but good windows, and fr3's error rose to 6.4%.

**What it means for a robot.** Pool by random effects and stop when the pooled sd reaches the target. On this data, a 2.5% sd took about eight windows, ten seconds of video, not one. The error bar can be trusted at each step along the way. What it cannot see is an offset every window shares: fr1/xyz stays about 3% off even at eight windows. A rotation threshold will not catch that case. The signal has to come from the solve itself, for example how spread out the viewing directions are, which predicted error on the checkerboard earlier in the programme. That is the next step.

**Caveats.** There are three sequences from one dataset. Sliding blocks overlap, so 45 blocks are far fewer than 45 independent tests. The checkerboard reference that exposes fr1/xyz's offset is one a robot in the field does not have.

Code and numbers: [`research/sensing-selfcal/experiments/m3d_pool/`](../../research/sensing-selfcal/experiments/m3d_pool/), log entry "Milestone 3d", live page https://marisstella.app/research/sensing-selfcal/.
