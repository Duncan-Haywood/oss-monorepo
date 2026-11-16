---
title: "A camera calibrating itself from ordinary video is 4 to 12 times overconfident"
seo_title: "Camera self-calibration from video: how honest is the uncertainty?"
date: 2026-11-16
tags: [sensing-selfcal, research, camera-calibration, robotics, bundle-adjustment]
description: "Self-calibration from SIFT tracks of 1.2 s video windows missed f by 3-7%, with a solver sd 4-12x too small; the median of many windows was within 1.5%."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from what it sees, without a checkerboard, and whether the solver's own error bar can be trusted. So far every experiment fed the solver a checkerboard's corners (with the board's shape withheld). That gives clean, well-spread points, which a working robot does not have. This run tried what a robot does have: SIFT features tracked through ordinary hand-held video.

**The setup.** We used three sequences from the TUM RGB-D benchmark (CC BY 4.0), filmed with the same two cameras whose checkerboard views earlier milestones calibrated: a Kinect sweeping over a desk, the same Kinect moving mostly in straight lines (little rotation), and an Asus Xtion passing sideways in front of a textured structure. We cut each sequence into disjoint 1.2-second windows of 12 keyframes, 65 in all. Each window was self-calibrated: SIFT matches, tracks across frames, then a robust bundle adjustment that solves for the focal length, principal point, two distortion terms, every camera pose and every 3D point. Each window started from three different focal-length guesses, and the lowest-cost solution was kept. We scored the result against each camera's checkerboard calibration. The four predictions were written in the log before anything was computed.

**All four predictions failed.** Results from the 57 windows that converged:

- **One window is not accurate.** On the desk sweep, the median window's focal length was 2.8% off the checkerboard calibration (we predicted at most 2%). The straight-line sequence was 5.2% off and the Xtion pass 7.2%. Single windows ranged from −14% to +37%.
- **The error bar is far too small.** If the solver's standard deviation were honest, the errors measured in standard deviations would have an rms near 1. They came out at 9.3. Only 11% to 27% of windows fell within two of their own standard deviations.
- **It is not the reference's fault.** Leaving the checkerboard out entirely, f scattered from window to window by 4.2, 8.4 and 11.7 times the solver's median standard deviation.
- **The solver does not notice weak motion.** Moving in a straight line is the textbook case where focal length cannot be pinned down. On that sequence the real scatter was 2.8 times the desk sweep's, but the solver's standard deviation rose by only 1.28 times.

With checkerboard corners, the same programme found the solver about 2× overconfident (milestone 3). Natural features make it 4 to 12×. Bad local minima are common (the three starts disagreed in half the windows) but they do not explain it: windows where all three starts agreed were just as overconfident.

**What does work is the scatter itself.** On every sequence, the median of 15 to 24 windows landed within 1.5% of the checkerboard calibration: +0.7% on the desk, −1.4% on the straight-line sequence, and +1.5% on the Xtion (+0.2% against TUM's own published calibration). An error bar built from how much the windows disagree covers the reference in all three cases. We picked that check after seeing the results, so treat it as a description, not a test.

For a robot, the practical reading is: don't accept a calibration update because one short solve says it is precise. Solve many short windows and use their spread. This matches what the last milestone found from the other direction. The camera's model is missing an error shared by each whole view, and on ordinary video it is bigger.

**Caveats.** Windows from one sequence share a scene and a session, so they are not independent samples. The two references for each camera disagree by 0.3% (Kinect) and 1.2% (Xtion). We have not yet tested what causes the overconfidence. The candidates are SIFT errors that persist along a track across consecutive frames, the rolling shutter on both sensors, and the near-critical motion of a 1.2-second window. Those are the next steps, along with a leave-one-view-out jackknife, which fixed the 2× with board corners.

Code, data fetch script and numbers: [`experiments/m3b_natural/`](../../research/sensing-selfcal/experiments/m3b_natural/) in the [`sensing-selfcal` project](../../research/sensing-selfcal/README.md). The pre-registered plan and the result are in its [research log](../../research/sensing-selfcal/LOG.md).
