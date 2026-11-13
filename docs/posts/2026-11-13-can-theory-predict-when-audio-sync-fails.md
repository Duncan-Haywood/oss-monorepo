---
title: "Can a 1982 formula predict when audio sync will miss a frame?"
seo_title: "Predicting GCC-PHAT audio sync failures with a threshold model"
date: 2026-11-13
tags: [research, capture-sync]
description: "A 1982 threshold formula, fed each window's spectra, predicted real-speech sync misses within x2 in 80% of cells. In babble, PHAT went from worst to best."
---

Earlier today we [synced five real phones by their sound](2026-11-13-five-real-phones-audio-sync-phat-loses.md) and counted how often a short window of audio put the offset more than one video frame (33 ms) off. The next question in the [programme](../../research/capture-sync/) is whether you can know that rate in advance from the sound itself, before an edit goes wrong.

There is a classic answer. In 1982 J. P. Ianniello worked out the probability that a cross-correlation's peak lands on a wrong lag when signal and noise are Gaussian. Below a threshold SNR, estimates stop being slightly off and start being anywhere. Nobody seems to have checked that formula on real speech in reverberant rooms, which is what camera audio is.

## What we did

We extended the formula to the weighted correlations people actually use (PHAT and partial whitening) and fed it each window's own measured spectra. Then we compared it with 84,000 windows where we knew the right answer:

- **Gaussian signals**, the formula's own assumptions, as a check of our code;
- **real read speech** from Microsoft's MS-SNSD collection (MIT licence), with white noise or real recorded babble, in a dry room or in simulated rooms with 0.2 s and 0.8 s of reverberation.

We wanted the real phones from the morning's dataset. This session couldn't reach the server that hosts them, so the delays and rooms here are simulated, while the speech and the babble are real recordings. The script for the real-phone check is written and waiting.

## What came out

- **The formula works, roughly.** On real speech it predicted the miss rate within a factor of two in 137 of 171 cells (80%). We had pre-registered 75% as the bar. It runs low, predicting about 60 to 75% of the misses that happen, and it is worst for short windows when the noise is mild. There, words and pauses decide the result, not noise. When noise dominates (-15 dB), 82 of 83 cells agree.
- **The Gaussian check missed its own bar by a hair**: 32 of 36 cells agreed, against the 90% we asked for. All four misses are one cell: half-second windows at -10 dB.
- **Part of why PHAT did so badly this morning is how it's usually computed.** Textbook GCC-PHAT divides each frequency bin by its own noisy magnitude. The same weighting computed from smoothed spectra missed 33% of windows across the speech cells instead of 40%. In the echoey room with white noise it missed 6% instead of 25%.
- **With babble the ranking flips.** When the noise is other people talking, PHAT is the best weighting and plain correlation the worst: half the windows missed with PHAT against 79% with plain correlation, in the echoey room at -10 dB. This morning's advice, "partial whitening, not PHAT", turns out to hold only for white noise. We didn't predict this; it's labelled as an after-the-fact finding.
- **The formula makes a decent alarm for PHAT.** Computed from spectra lined up at the window's own estimate, so with no ground truth, it flagged PHAT's failures better than the usual peak-sharpness score in every cell we scored (median AUROC 0.85 against 0.74). For partial whitening it didn't help.

## What it means if you're building a rig

Which weighting you should use depends on what the noise sounds like, and a sync tool can measure that from the same audio. A crowd calls for whitening; wind or hiss calls for less. The next steps are the real phones (step 2b) and noise both cameras hear at once, the way a real crowd is.

Code, data sources and the pre-registered predictions are in [`research/capture-sync`](../../research/capture-sync/).
