---
title: "Audio sync on long takes: a warming clock breaks a held line, a one-frame gate does not"
seo_title: "Audio sync and clock warm-up drift on 30-minute takes"
date: 2026-11-23
description: "On 30-minute simulated takes whose clock warms up by 30-60 ppm, holding the first sync is off by a frame 20-59% of the time; a gated tracker stays at 2.5-4%."
tags: [research, capture-sync, audio-sync, clock-drift, signal-processing]
---

The [capture-sync](../../research/capture-sync/) programme asks how well sound can keep free-running cameras and phones within one video frame of each other. [Yesterday's step](2026-11-22-capture-sync-hold-the-line-gate-the-rest.md) reached an awkward conclusion. Once the first 20 seconds are searched over clock rate as well as lag, the best session tracker was none at all: take the offset and rate from those 20 seconds, draw a straight line, and never update it. Every rule that re-estimated the offset during the session only added errors.

That result came from 3-minute sessions in which each clock ran at one constant rate. Real recorders do not behave like that. Gburrek, Schmalenstroeer and Haeb-Umbach (ICASSP 2022) describe a device's sample rate moving by a few parts per million in the first few minutes after power-on, as its crystal warms up. A held line cannot follow that. Every ppm the first 20 seconds missed adds up over the rest of the take, and a 30 fps frame is only 33 ms.

**The arithmetic first.** Take a warm-up of w ppm that settles with a 120 s time constant. The error of a held line is the integral of that rate change, minus the part the first 20 seconds already measured. Over 30 minutes it peaks at 7, 21, 42 and 85 ms for w = 5, 15, 30 and 60 ppm. So a held line should survive the small warm-ups and lose sync at 30 ppm and above: after about 23 minutes at 30 ppm and about 13 minutes at 60 ppm. We wrote these numbers down, with seven predictions, before running anything.

**The test.** We ran 100 simulated 30-minute sessions: the ten MS-SNSD speech blocks one after another, two devices in a 200 ms room, ten kinds of real noise at -10 dB, and device 1's clock 17 ppm off (the rate measured between two real phones in step 1) plus the warm-up. Building it needed a recorder whose clock rate changes over time. The new [`capture_sync.clock`](../../research/capture-sync/src/capture_sync/clock.py) maps every source sample to where a drifting clock would record it, then reads the source back at the inverse of that map with a windowed-sinc interpolator. It is checked against an analytic sinusoid and against paderwasn's constant-rate resampler.

**What happened.** Share of the session more than a frame off, averaged over the ten noise types:

| warm-up | first 20 s wrong | held line | gated tracker |
|---|---|---|---|
| 0 ppm | 2.0% | 2.2% | 2.1% |
| 5 ppm | 6.0% | 7.1% | 6.0% |
| 15 ppm | 3.5% | 4.6% | 3.6% |
| 30 ppm | 2.5% | 20.5% | 2.5% |
| 60 ppm | 4.0% | 58.6% | 4.1% |

The gated tracker is yesterday's runner-up. Every 5 seconds it measures the offset in a 2 s window, but it accepts a measurement only if it lands within one frame of the current line. It then fits a line through the measurements it accepted. Under every warm-up it stays exactly as good as its starting point. Wherever the first 20 seconds were right, its largest error over the whole take was under a millisecond. The held line's error followed the arithmetic closely: at 60 ppm it crossed a frame after a median 768 s, against 749 to 826 s predicted.

The surprise was at the small warm-ups, where the held line should not have lost sync at all. It did, in 15 sessions, and in every one the first 20 seconds had found the right offset but a rate 9 to 66 ppm wrong, mostly under white noise. A held line never corrects that. The gate corrects it within a minute.

**What it changes.** For a long take the advice reverses: keep re-measuring, but let a measurement move the line only when it agrees with the line to within a frame. Requiring 60 seconds of agreement instead of 20 made no difference (at most 0.13 points). What the tracker cannot fix is the 2 to 6% of sessions whose first 20 seconds are wrong outright. That is now the whole of the remaining loss, and the next step.

**Limits.** These are simulated sessions in one room. The warm-up amplitude and time constant are swept, not measured: the paper's measured rate trajectories are hosted on zenodo, which this run could not reach. Supply-voltage jitter and slow random wander are not modelled. The full tables, the plan as written before the run and the code are in the [project README](../../research/capture-sync/README.md) and [research log](../../research/capture-sync/LOG.md).
