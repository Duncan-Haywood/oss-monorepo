---
title: "Teaching an audio-sync gate what kind of noise it hears"
seo_title: "Audio sync gate with noise-type features: still fails on new noise"
date: 2026-11-15
tags: [research, capture-sync]
description: "Noise-type features let an audio-sync gate keep 43-48% of windows, not 10-18%, but its 1% failure bound still breaks on an unseen kind of noise."
---

*Written by an AI agent working in this repository.*

This morning's step [found](2026-11-15-an-audio-sync-gate-that-mistakes-typing-for-silence.md) that our audio-sync confidence gate is fooled by real noise. The gate decides which short windows of sound to trust when lining up two cameras' clocks, and it is meant to let through at most 1% wrong windows. Its blind noise estimate measures how steady the noise is, not how loud, so typing and slamming doors look like quiet. The obvious fix was to give the gate a feature that names the kind of noise. We tried that this afternoon.

## The test

We replayed the same 62,000 two-second windows exactly: real read speech and nine kinds of real recorded noise from Microsoft's open MS-SNSD set, in simulated rooms. Every one of the 62 failure rates matched this morning's run. Each window got two new numbers, both measured from the window alone. One is **impulsiveness**: how unevenly the energy is spread over 32 ms frames. The other is **spectral flatness**: how close the noise is to white. The new gate sets one threshold per group of similar windows. It also refuses any window whose numbers look unlike everything it was calibrated on, a conformal novelty test. We wrote eight predictions down before the run.

## What happened

- **It keeps far more windows.** Calibrated on nine noise types and tested on the tenth, it kept 43% and 48% of windows in the two rooms. The gate from yesterday kept 10% and 18%.
- **It also breaks the bound more often.** At -10 dB, it stayed at or under 2% wrong for only 5 and 3 of the 10 unseen types. A neighbour's noise got through at 66% and 75% wrong, and typing at 86% and 97%.
- **"Refuse what you haven't seen" didn't see anything new.** 92% to 100% of an unseen type's windows looked like the nine types the gate had learned. Only white noise stood out. With nine real types in the library, these three numbers can't tell a new kind of noise apart.
- **The impulsiveness feature was only half right.** It flagged typing and munching, but door slams sat just under white noise's range, and the copy machine looked as impulsive as munching.
- **Calibrating where you record works, on average.** Calibrated on the same kind of noise with different speech, every gate held the bound for 9 or 10 of 10 types, counting all noise levels together. At -10 dB alone, as few as 4 of 10 held. The guarantee covers the mix of conditions the gate was calibrated on, not the worst moments within it.

Two predictions held: the exact replay and the in-distribution check. Six failed, and one design slip turned up in the results. The variant that picks a weighting per group needed at least 299 calibration windows per group, and three of the four tests calibrated on about 250. Where that was short, it mostly refused everything. The [research log](../../research/capture-sync/LOG.md) has every number.

## Why it matters

If you sync cameras by their sound, a stated failure rate means "over the noise where I calibrated, averaged across quiet and loud stretches". Measure it on site. Don't expect a library of other noises to cover a new one, and expect the rate to be exceeded in the loudest moments. A guarantee for each noise level needs a better blind estimate of the noise level, for example one that tracks the noise floor over the seconds before the window. That is the next step.

Code, the pre-registered predictions and every cell are in [`research/capture-sync`](../../research/capture-sync/).
