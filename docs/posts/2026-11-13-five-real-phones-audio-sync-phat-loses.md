---
title: "We synced five real phones by their sound, and the textbook weighting came last"
seo_title: "Audio sync of real phones: GCC-PHAT vs partial whitening on LibriWASN"
date: 2026-11-13
tags: [research, capture-sync]
description: "On five real phones in two rooms, a 2 s window of sound missed by over a frame 17-34% of the time with GCC-PHAT at -10 dB, 5-7% with partial whitening."
---

If you film one scene with several cameras and no timecode, you line the clips up by their sound. Every editing tool does it. The textbook way to find the offset between two recordings is a cross-correlation with "phase transform" weighting, GCC-PHAT. It's known to handle echoes well.

This repository has eighteen small projects on that problem for a travel creator's multi-camera kit. All of them used a delay we simulated. Some used real sounds, but none had two real devices recording the same moment. So today we opened a [research programme](../../research/capture-sync/) and ran its first step on real hardware: [LibriWASN](https://doi.org/10.5281/zenodo.10952434), a public dataset (CC BY 4.0) from Paderborn University. In it, five smartphones on a meeting table recorded the same read speech from loudspeakers, ten 10-minute sessions in each of two rooms, one with about 200 ms of reverberation and one with about 800 ms. The delays, echoes and clock drift are all real.

## How we scored it without ground truth

Nobody tells you the true offset between two phones. We built a reference from long 20-second windows across each 10-minute session, fitted a line, and checked it three ways. Nearly every window sat within 5 ms of the line. The line barely moved when we changed the weighting. And for every three phones A, B and C, the A-B and B-C offsets add up to A-C within 1.8 ms. A video frame at 30 fps is 33 ms, so a short window counts as a failure if it lands more than a frame away from the reference.

Then we cut short windows (0.5 to 4 s) at random times: 480,000 estimates over 200 phone pairs, five weightings, and three noise levels. The noise levels were the recording as it is, plus white noise added at 0 dB and at -10 dB.

## What came out

- **The phones' clocks drift apart by up to 19 parts per million** (median 13.7 ppm). Each pair keeps the same rate within about 1 ppm from one session to the next. At 19 ppm, a sync made once at the start of the day slips a whole frame in 29 minutes. Our earlier projects had assumed ±40 ppm, about twice what these phones show.
- **PHAT comes last once there is noise.** With -10 dB of added noise, a 2 s window missed by more than a frame 17% of the time in the drier room and 34% in the more echoey one with PHAT. Partial whitening (dividing by the spectrum's magnitude to the power 0.25 instead of 1) missed 5% and 7%. The session-bootstrap intervals don't overlap. An earlier project of ours had found the opposite in *simulated* rooms. The real rooms disagree.
- **The echoey room is harder, as expected**, but only at -10 dB and only for windows up to 2 s.
- **One prediction failed outright.** We expected under 1% failures on the recordings as they are. PHAT failed 3.3% of 2 s windows in the drier room. We guessed one misbehaving pair, then checked: it's spread across all ten pairs at scattered wrong lags. We don't know why yet.
- **The estimator can tell when it's wrong, mostly.** How sharply the correlation peak stands out from its background separates good windows from bad ones very well (AUROC 0.91 to 0.998 for 2 s windows). We set a cut-off in one room so that at most 1% of the accepted windows were wrong, then used it in the other room. Averaged over noise levels, it stayed under 2%. In the hardest case, -10 dB and going from the dry room to the echoey one, 3.7% of accepted windows were wrong. That's not the 1% it was set for.

## What it means for a camera kit

Use partial whitening, not PHAT. Expect phone and camera clocks to drift by tens of ppm, so re-sync during the day. And don't trust a confidence threshold tuned in one place to hold its error rate somewhere else. That last point is the programme's main question: a gate whose failure rate is still true in a room it has never seen.

The limits matter. This is read speech from a loudspeaker in a lab. The noise is synthetic and independent per phone, unlike a real crowd that both cameras hear. The devices are phones, not cameras, and the start offsets are simulated because the published files come pre-aligned. Next come the threshold theory from the 1980s checked against these numbers, a calibrated gate across more conditions, and real ambient noise.

Code, results and the full proposal: [`research/capture-sync`](../../research/capture-sync/). The recordings come from LibriWASN (Schmalenstroeer, Gburrek and Haeb-Umbach, 2023). Written with AI assistance.
