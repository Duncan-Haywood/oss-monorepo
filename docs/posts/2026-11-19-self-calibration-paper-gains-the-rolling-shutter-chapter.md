---
title: "The self-calibration paper gains its video chapter: shutter, prior, pool"
date: 2026-11-19
tags: [sensing-selfcal, research, camera-calibration, rolling-shutter, paper]
description: "Fourteen milestones of TUM video results go into the sensing-selfcal draft: a shutter term, a k1 prior and five pooled windows take f from 2.9% to 1.2%."
---

The `sensing-selfcal` programme asks whether a robot camera can recalibrate itself from ordinary video, with no checkerboard, and still know how far to trust the answer. Its [paper draft](../../research/sensing-selfcal/paper/draft.md) had stopped at milestone 3f, while the log had moved on to 3t. This run ran no new experiment. It wrote those fourteen milestones into the paper, so the argument a reviewer reads matches what the code found.

**What the new part of Section 4 says.** A 1.2-second window of hand-held video gives a focal length that is a few percent off. The obvious fix, borrowing the last board calibration's lens distortion, makes it worse. Re-solved on the real TUM images, the median error goes from 5.25% to 10.5%. The camera's rolling shutter is part of the real cause. With the motion-capture rotation rates and a free readout time in the solve, both TUM cameras show a readout of about 26 to 28 ms. The median error falls by a third to a half (fr3: 7.56% to 3.63%). What is left is scatter from window to window along a ridge where focal length, k<sub>1</sub> and the principal point trade off. It is not a bias.

Scatter along a ridge is what a prior is for. A soft prior on k<sub>1</sub>, built only from the camera's own earlier windows, takes the median error from 2.88% to 2.32% (Wilcoxon p = 0.0006). Pooling five such windows (6 s of video) by random effects gets to 1.17%, against 2.20% without the prior. The error bar stays close to honest (rms z 1.58). Pooling the same windows by inverse variance on the solver's own sd gives an rms z of 14.7.

**The new recommendation.** The draft's Section 8 now has a seventh rule for a practitioner. Model the shutter with a free readout. Keep a running k<sub>1</sub> memory from the raw window estimates, not from the prior-steadied ones, which shrink to a pin. Pool at least five windows by random effects, with the pooled sd floored at about 1% of f.

**How the numbers are kept honest.** Every figure in the draft is checked against a stored result file, or against the log entry written from the script's output, by `paper/check_numbers.py`. This step added 50 checks, and all 340 pass. The three new references (Kerl et al. 2015 on rolling-shutter RGB-D, and two papers on the Hartung–Knapp variance) were looked up by DOI from this session.

**What it does not show.** The video results come from three sequences and two cameras, with one recording order each. The rotation rates come from motion capture, not an onboard gyro. The Xtion's +2.8% focal bias is still unexplained. Next is a test of the prior after a bad start, and cutting the draft, about 8,200 words, to RA-L's eight pages.

The log for each milestone, with its predictions written before the run, is in the [research log](../../research/sensing-selfcal/LOG.md).
