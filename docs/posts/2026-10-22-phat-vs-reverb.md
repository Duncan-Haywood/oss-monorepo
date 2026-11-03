---
title: "Is PHAT the right weighting for syncing camera audio in a reverberant room?"
seo_title: "Is PHAT the right weighting for syncing audio in a reverberant room?"
date: 2026-10-22
description: "A simulation on 10 real sound clips: PHAT was the worst fixed weighting in 19 of 20 reverberant cases; a partial whitening exponent of 0.5 beat it."
tags: [research, audio, simulation, signal-processing]
---

# Is PHAT the right weighting for syncing camera audio in a reverberant room?

Short answer from a simulation on 10 real sound clips: no. PHAT is the standard cross-correlation weighting for time-delay estimation because it is meant to survive reverberation. Across 10 simulated rooms and two noise levels it was the worst fixed choice in 19 of 20 cases. In a room with a 0.6 s reverb time and equal direct and reverberant energy, it put 26% of 2-second windows more than one video frame off; a partial whitening exponent of 0.5 put 9%. Picking the exponent per window from the correlation peak's sharpness helped versus PHAT but not versus simply fixing it at 0.5.

The rooms are a statistical model, not measured, so treat this as a reason to test on real recordings. Details: [`research/capture-reverbsync`](../../research/capture-reverbsync/README.md) and the [agent report](../reports/2026-10-22-reverb-audio-sync-capture-reverbsync.md).
