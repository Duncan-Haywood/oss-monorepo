---
title: "Audio sync of phones: a simulated room picked the right fix, but guessed the failure rate low"
seo_title: "Audio sync: the simulated room against five real phones"
date: 2026-11-18
description: "On five real phones a simulated room ranked ten noise types right (Spearman 0.89-1.00) but ran low: white noise failed 5-10% real against under 1% simulated."
tags: [research, capture-sync, audio-sync, sim-to-real]
---

The [capture-sync](../../research/capture-sync/) programme asks how often a few seconds of sound can sync two free-running cameras or phones to within one video frame. For the last eight steps every noise result came from a simulation: clean read speech played through a statistically generated room, with a delay added by the code. Those steps settled on one estimator. Each device's audio is divided by its own 32 ms loudness envelope before the cross-correlation. In the simulated room that took typing noise from 78% of windows a frame off to 0.1%.

A simulation is only worth trusting if it predicts the real thing, so this step went back to real recordings. LibriWASN has five smartphones recording the same loudspeaker playback on their own clocks, in a drier and a wetter room. We added the same ten noise types to its 2 s windows, a separate recording for each phone, and ran both estimators on 168,000 windows. The windows of the earliest real-phone step were replayed bit for bit, and all six of its numbers came out the same. Eight predictions were written down before the run.

What the simulation got right:

- **The order.** Across the ten noise types the real failure rates at -10 dB rank like the simulated ones (Spearman 0.98 and 1.00 for plain correlation, 0.89 and 1.00 for the normalised one).
- **The fix.** On real phones normalising takes typing from 66% to 2.8% and 79% to 1.3% of windows a frame off. Munching and door slams drop to 2-3%. Summed over the ten types the failure halves.
- **The cost.** Steady noise is worse after normalising, on the real phones too: air conditioner +7.4 and +10.5 points, more than the simulation's +8.6 and +7.0.

What it got wrong is the level. With white noise the real phones miss 5-10% of windows where the simulated room misses under 1%. After normalising, real impulsive noise still fails 1.3-2.9% of windows against 0.0-0.3% simulated. Averaged over all ten types the normalised estimator misses 13% and 21% of real windows, against 11% and 13% in the simulation.

That split matters for anyone building a multi-camera rig. A statistical room was good enough to *choose* the estimator, since every conclusion from the simulated steps held. It was not good enough to *set a failure bound*. A confidence gate set for 1% wrong windows, calibrated on real recordings, keeps 78% and 65% of real -10 dB windows. It holds 2% for 7 and 6 of the 10 noise types, and the misses are babble and other speech-like noise. On plain correlation the same gate refuses almost every window.

Six of the eight predictions held. Two failed. On easy audio normalising was expected to make no difference, and it turned out *better* by up to 3.5 points. Under the gate it was expected to meet 2% for at least as many noise types as plain correlation, and it met fewer. Plain correlation's count only looks good because its gate refuses nearly everything. Limits: the noise is added, not recorded in the room; the source is one loudspeaker playing read speech; these are phones, not cameras. Next is to tune the simulated room until its white-noise failure matches the real 5-7%, and see whether it then predicts real levels as well. The [README](../../research/capture-sync/README.md) has the full table and [LOG.md](../../research/capture-sync/LOG.md) has the predictions as written.
