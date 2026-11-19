---
title: "A robot camera that remembers its earlier self-calibrations gets the next one right more often"
seo_title: "Camera self-calibration with a prior from its own earlier windows"
date: 2026-11-19
tags: [sensing-selfcal, research, camera-calibration, self-calibration, tum-rgbd, robotics]
description: "On 53 real TUM windows, a soft k1 prior from the camera's other windows cut focal scatter by a quarter to half and the median error from 3.06% to 2.43%."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from 1.2 seconds of ordinary video, with no checkerboard. Yesterday's run found what is left of the focal-length error on the TUM RGB-D video. Once the rolling shutter is modelled, the errors mostly cancel across windows. The median window is within the 1.6% that three honest calibrations of the same Kinect disagree by. The problem is the spread: single windows land 2% to 6% off, in either direction ([milestone 3q](2026-11-18-tum-focal-error-is-scatter-not-bias.md)).

Where a window lands depends on its own lens-distortion estimate, k<sub>1</sub>. Within 1.2 s, focal length, distortion and principal point can trade off against each other along a flat ridge, and the images barely tell them apart. Earlier milestones tried pinning k<sub>1</sub> at the checkerboard's value, and that made things worse.

**The idea.** A robot that has self-calibrated before has a memory: the k<sub>1</sub> and principal point its earlier windows found. So we gave each window a soft prior. It is centred on the median of the same camera's *other* windows, as wide as their spread. No checkerboard and no reference value goes into it. We solved each of 53 real windows four ways:

- **est_p:** a prior on k<sub>1</sub> and the principal point, as wide as the other windows' spread.
- **est_ph:** the same prior at half the width.
- **est_pk1:** a prior on k<sub>1</sub> only.
- **est_px:** a prior taken only from the Kinect's *other* recording session, the honest test of carrying a calibration across sessions.

The seven predictions were committed before any solve ran ([LOG](../../research/sensing-selfcal/LOG.md)).

**What came out.** Five of seven held.

| model (53 windows) | median focal error | windows over 10% off | 90th percentile |
|---|---|---|---|
| no prior (est) | 3.06% | 9 | 13.1% |
| prior on k<sub>1</sub> + principal point | 2.43% | 4 | 8.5% |
| same, half width | 2.77% (52 windows) | 3 | 6.2% |
| prior on k<sub>1</sub> only | 2.38% | 4 | 9.1% |

The prior lowered the error in 35 of 53 windows, and a paired Wilcoxon test gives p = 0.002. It cut the window-to-window scatter from 2.1% to 1.6% on fr1/desk, 6.0% to 3.3% on fr1/xyz, and 6.0% to 4.1% on the Xtion sequence. The median focal length moved by less than 1% in every sequence, so the prior tightens the spread without moving the centre. The images barely notice it: the fit cost rose by a median 0.05%. The worst windows gained most. One fr1/desk window went from 15.1% off to 0.4%, and one Xtion window from 25.7% to 4.6%.

A prior from the other session works too. It cut the median error to 0.62 and 0.71 times its value on the two Kinect sequences. It also carries that session's centre across: fr1/xyz's median moved from 0% to +2.4%.

Two predictions failed. A tighter prior did not lower the median error further, though it did cut the tail of bad windows. And the principal point added nothing: a prior on k<sub>1</sub> alone did as well. The focal length follows k<sub>1</sub>.

**What it does not fix.** The Xtion's median stays about 2% high against its board calibration, with or without the prior. A prior steadies scatter; it cannot remove a bias the windows share. The solver's own error bar is also still 2.5 to 4 times too small, down from 3 to 7.

**What it means for a practitioner.** If a robot recalibrates its camera from video, keep a running median and spread of the k<sub>1</sub> values it has found, and put them into the next solve as a prior at that spread. It costs nothing the images notice, and it roughly halves the windows that come out 10% wrong. The next step is the causal version, using only windows that came earlier in time, as a robot in the field would have them.
