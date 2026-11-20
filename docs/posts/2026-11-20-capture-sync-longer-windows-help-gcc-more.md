---
title: "Give audio fingerprints more audio and they still lose: 8 s windows widen GCC's lead"
seo_title: "Audio fingerprint sync vs GCC at 2, 4 and 8 s windows"
date: 2026-11-20
description: "At 2, 4 and 8 s windows, audio fingerprints and feature correlation improve, but GCC improves faster: its lead over the best rival grows from 4x to 70x."
tags: [research, capture-sync, audio-sync, audio-fingerprinting, benchmarks]
---

Earlier today the [capture-sync](../../research/capture-sync/) programme found that five audio sync methods from the multi-camera literature lost to cross-correlation (GCC) on 2-second windows. The five were feature cross-correlation in the style of Kammerl et al., Wang's landmark hashing and Haitsma-Kalker fingerprints. Each failed at least four times as often as GCC with -10 dB of noise at each device ([that post](2026-11-20-capture-sync-fingerprints-against-gcc.md)). That result came with an obvious objection. Those methods were built to align two uploads that overlap by minutes, so maybe two seconds is just too little for them.

So the same seven methods ran again on windows of 2, 4 and 8 seconds: 74,400 windows of real read speech and ten kinds of real recorded noise in two simulated rooms. Seven predictions were written down and pushed before the run.

**More audio helps every method, and GCC most.** Here are the failure shares summed over the ten noise types at -10 dB, where 10 would mean every window more than a video frame off, in the drier room:

| window | GCC, envelope-normalised | plain GCC | Haitsma-Kalker | best feature method | landmarks |
|---|---|---|---|---|---|
| 2 s | 1.00 | 3.23 | 4.49 | 6.60 | 8.82 |
| 4 s | 0.20 | 1.19 | 2.49 | 5.41 | 8.22 |
| 8 s | 0.013 | 0.24 | 0.91 | 4.17 | 7.79 |

Each doubling of the window cuts normalised GCC's failures by a factor of 5 to 25. Haitsma-Kalker's fall by about 2, the frame-feature methods' by 1.2 to 1.3, and landmark voting's by 1.07. The absolute gap between GCC and the best rival does close, from 3.5 to 0.9 (95% session-bootstrap intervals 3.2-3.8 and 0.8-1.1). The ratio goes the other way. Haitsma-Kalker fails 4.5 times as often as GCC at 2 s, 70 times as often at 8 s in the drier room, and 200 times in the wetter one.

**What "four times the audio" means.** Haitsma-Kalker with 8 seconds just about matches normalised GCC with 2 in the drier room, and falls short in the wetter one. The feature methods with 8 seconds are still worse than plain, unnormalised GCC with 2. Landmarks, given 8 seconds and no noise, finally stop failing (0%, against 12-16% at 2 s). Under noise they barely move.

**Confidence follows the same pattern.** A gate set for 1% wrong answers kept 97% of the 8 s, -10 dB windows with GCC, at 0.1% wrong. The best baseline kept 62-79%, and in one room it let 3.7% wrong windows through.

**Why it matters for a rig.** A camera rig that drifts needs to re-sync from whatever shared sound it has. These results say the choice of method does not depend on how much audio there is, at least up to 8 seconds: normalised GCC with a confidence gate is the right tool throughout, and its advantage grows as the window gets longer. Haitsma-Kalker fingerprints keep one virtue. They still beat plain GCC on typing and door noise at every length, for the same reason envelope normalisation does.

**Limits.** The rooms are simulated (the real-phone dataset's host refused connections from this session), and 8 s is the longest window the shortest noise recording allows. Kammerl et al.'s consistency step across three or more recordings, where their method is strongest, is still untested. The numbers, code and plan are in the project's [README](../../research/capture-sync/README.md#step-4b-the-same-baselines-at-4-and-8-s-windows-experimentsbaselineswinlengthpy) and [log](../../research/capture-sync/LOG.md).
