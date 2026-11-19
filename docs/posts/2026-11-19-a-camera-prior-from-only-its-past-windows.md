---
title: "A camera's self-calibration memory still works when it may only look backwards"
seo_title: "Causal prior for camera self-calibration on TUM RGB-D"
date: 2026-11-19
tags: [sensing-selfcal, research, camera-calibration, self-calibration, tum-rgbd, robotics]
description: "On real TUM video, a k1 prior from the camera's earlier windows only cut the median focal error from 2.88% to 2.32% (p = 0.0006). Five windows were enough."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from 1.2 seconds of ordinary video, with no checkerboard. This morning's run gave each window a soft prior on its lens distortion k<sub>1</sub> and its principal point. The prior was centred on the median of the same camera's other windows and was as wide as their spread. It cut the focal-length scatter by a quarter to a half ([milestone 3r](2026-11-19-a-camera-that-remembers-its-own-calibrations.md)).

That test had a catch. "The other windows" included windows recorded *later*, and a robot in the field has only its past. So this run made the prior causal and asked whether the gain survives.

**What we did.** We took the same 53 counted windows from three TUM RGB-D sequences and put each camera's windows in recording order. For the Kinect, all 17 fr1/xyz windows come before the 13 fr1/desk windows, because xyz was recorded about six minutes earlier. The Xtion has one sequence, fr3/structure_texture_far, with 23 windows. Each window was solved with milestone 3n's rolling-shutter model plus a prior built only from the windows before it. The prior starts once five earlier windows exist, which left 43 windows to score. We tried two ways of keeping the memory:

- **est_c:** remember each earlier window's own estimate, made without a prior.
- **est_cr:** remember each earlier window's *prior-steadied* estimate. The memory feeds on itself, so it should tighten over time. The worry was that it would lock in an early mistake.

The eight predictions were committed before any solve ran ([LOG](../../research/sensing-selfcal/LOG.md)). All eight held.

**The causal prior keeps most of the gain.** Over the 43 scored windows, the median focal error against the board calibration fell from **2.88% to 2.32%**. The error was lower in 30 of 43 windows (paired Wilcoxon p = 0.0006). The window-to-window scatter fell by 32% on fr1/desk, 28% on fr3 and 51% on fr1/xyz. Windows more than 10% wrong went from 9 to 4. The median focal length moved by under 0.7%, and the image fit got worse by a median 0.07%. On the same windows the look-ahead prior from milestone 3r reached 2.07%, so the causal version keeps about two thirds of its gain.

**Five windows are enough to start.** Windows whose prior had only 5 to 9 earlier windows behind it improved by a median 0.44 percentage points. Windows with 10 or more improved by 0.86.

**The self-feeding memory collapses to a pin, and here that did no harm.** Updated from its own steadied estimates, the k<sub>1</sub> prior's width fell to 12% of est_c's on the Kinect and 2% on the Xtion by the last window. Within about ten windows it had become, in effect, a fixed k<sub>1</sub>. On these sequences that fixed value landed close to where the camera usually sits. The median error barely changed (2.42%) and the tail shrank further: only 2 windows were more than 10% wrong. But the pin was set by the first five windows. Earlier milestones (3f to 3j) found that pinning k<sub>1</sub> at a wrong value hurts badly. A robot whose first five windows happen to be bad would carry that error indefinitely. That case has not been tested yet.

**What it means for a practitioner.** Keep a running median and robust spread of the raw k<sub>1</sub> and principal point from the camera's past self-calibrations. Feed them into the next window as a soft prior once you have five. Build the memory from the raw estimates, not from the prior-steadied ones, or put a floor under its width. This fixes scatter, not bias: the Xtion still reads about 2.8% high against the board on these windows.

**Limits.** There is one recording order per camera, the Xtion has a single session, 43 windows were scored, and the five-window threshold is one choice we did not tune. The next step is a bad-start test of the self-feeding memory, followed by the causal prior on the programme's accept/reject gate.

Code, results and figure: [`research/sensing-selfcal/experiments/m3s_causal`](../../research/sensing-selfcal/experiments/m3s_causal/).
