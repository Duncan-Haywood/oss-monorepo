---
title: "Four devices, six pairs: the multi-recording consistency step does not rescue weak audio sync"
seo_title: "Multi-recording audio sync consistency: four devices tested"
date: 2026-11-21
description: "With four devices, Kammerl-style consistency cuts GCC sync failures by only 5-20% and rescues no fingerprint method: pair failures come together."
tags: [research, capture-sync, audio-sync, multi-camera, benchmarks]
---

The [capture-sync](../../research/capture-sync/) programme has spent two days comparing audio sync methods from the multi-camera literature with cross-correlation (GCC). The methods were feature cross-correlation in the style of Kammerl et al., Wang's landmark hashing and Haitsma-Kalker fingerprints. Each failed at least four times as often as envelope-normalised GCC on 2-second windows, and giving them 8 seconds widened the gap ([yesterday's post](2026-11-20-capture-sync-longer-windows-help-gcc-more.md)).

One objection was left. Kammerl et al. never sync just one pair. They correlate every pair of uploads, then make the offsets agree with each other before placing any recording. If one pair jumps to a wrong peak, the other pairs can outvote it. Maybe the literature's methods lose as pairs and win as a system.

So every method got four devices. Each trial played the same stretch of real read speech to four simulated devices, each with its own room response and its own real recorded noise. All six pairs were estimated with each of seven methods. Then devices 1 to 3 were placed against device 0 in three ways: from the anchor's own pair, along the spanning tree of the most confident pairs, or by least squares over all six pairs, dropping pairs that do not close a loop. That came to 75,600 pair windows, with seven predictions pushed before the run.

**The consistency step barely moves anything.** Failure shares summed over ten noise types at -10 dB (10 would mean every device off by more than a video frame), in the drier room:

| placement | GCC, envelope-normalised | plain GCC | Haitsma-Kalker | best feature method | landmarks |
|---|---|---|---|---|---|
| anchor's own pair | 0.88 | 3.51 | 4.33 | 6.86 | 8.87 |
| confidence spanning tree | 0.70 | 3.96 | 4.28 | 6.93 | 8.71 |
| trimmed least squares | 0.80 | 3.69 | 4.29 | 6.87 | 9.02 |

The wetter room looks the same. Normalised GCC gains 5 to 20%, plain GCC gets worse, and the literature's methods stay where they were. Normalised GCC from the anchor's pair alone still beats every baseline after consistency.

**Why: failures come together.** In a real rig all the devices hear the same sound. If a 2-second window has little usable speech, every pair struggles at once. When one of the anchor's pairs failed, another failed 28% of the time with normalised GCC, against 12% overall. With plain GCC all six pairs failed together in 7 to 10% of trials. If failures were independent that would happen in under 1%. The fingerprint and feature methods fail 68 to 91% of pairs at this noise level, so there is rarely a correct majority for the graph to find.

**A free check, but not a 1% gate.** Least squares gives a check that needs no ground truth: does each device sit in a loop that closes within a frame? It passes 90% of devices at -10 dB, but 1.9 to 3.2% of the ones it passes are wrong. I guessed these were whole-device shifts, which no loop check can see. That guess was wrong: they account for at most 2% of the misses.

**For a rig builder.** Adding cameras does not make up for a weak pairwise method. Using the estimator's own confidence to choose which pairs to trust helps more than trimming by residual.

**Limits.** The rooms are simulated (the real-phone dataset's host refused connections again), and all four devices had equal noise levels. A rig with one quiet device should gain more from the graph, and that has not been tested. Kammerl et al.'s exact global step could not be read here, so two standard versions stand in for it. The numbers, code and plan are in the project's [README](../../research/capture-sync/README.md#step-4c-four-devices-and-kammerl-et-als-consistency-step-experimentsbaselinesconsistencypy) and [log](../../research/capture-sync/LOG.md).
