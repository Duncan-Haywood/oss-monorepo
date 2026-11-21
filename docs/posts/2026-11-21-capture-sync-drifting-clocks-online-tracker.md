---
title: "Drifting clocks: the sensor-network sync tracker loses to GCC, and drift breaks long coarse correlations"
seo_title: "Online WACD vs GCC for syncing drifting cameras and phones"
date: 2026-11-21
description: "On 120 drifting twin sessions, paderwasn's online tracker was out of sync 1.9-4.3x as often as GCC. Clock drift smears any 20 s coarse correlation."
tags: [research, capture-sync, audio-sync, clock-drift, benchmarks]
---

The [capture-sync](../../research/capture-sync/) programme asks how well sound can keep free-running cameras and phones within one video frame of each other. Its last four steps compared GCC (generalised cross-correlation) with the multi-camera literature's fingerprint methods, and GCC won every time ([this morning's post](2026-11-21-capture-sync-more-devices-do-not-rescue-weak-sync.md)). One baseline was still missing. It comes from a different field: wireless acoustic sensor networks, whose open code `paderwasn` (Paderborn University, MIT licence) tracks how fast two device clocks drift apart.

That tool answers a different question from ours. It estimates the sampling-rate offset, the parts-per-million by which one clock runs fast. A camera rig cares about something else: what share of the session is more than a frame out of sync. So this step put both kinds of method on that footing.

**The setup.** 120 simulated sessions, each about 3.5 minutes of real read speech played to two devices in a simulated room. Device 1's clock ran 17 ppm off, which is what this programme measured between real phones. Two more settings, 100 and 300 ppm, stand in for cheaper clocks; nobody has published those figures for camera audio, so they are a sweep. Each device got its own real recorded noise at -10 dB. paderwasn's pipeline was ported line by line, since it isn't on PyPI. It finds a coarse offset by plain correlation over the first 20 seconds, then tracks the drift with online WACD (weighted average coherence drift). Seven predictions were pushed before the run.

**Share of the session more than one 30 fps frame off**, mean over ten noise types, drier room:

| clock offset | paderwasn | GCC offset, held | GCC offset + WACD drift | GCC windows + line |
|---|---|---|---|---|
| 17 ppm | 34% | 3% | 3% | 8% |
| 100 ppm | 57% | 16% | 15% | 17% |
| 300 ppm | 84% | 73% | 54% | 38% |

The wetter room looks the same. paderwasn was out of sync 1.9 to 4.3 times as often as the best GCC tracker, in every cell. The drift tracker itself is not the problem. With no noise its rate estimate is excellent: a median error of 0.02 to 0.66 ppm, better than a line through GCC windows. The problem is its coarse step. Plain correlation is a frame off in a quarter to a third of noisy sessions, against 1.5 to 3% for envelope-normalised GCC. Once that start is wrong, WACD measures coherence between misaligned audio and its estimate runs away, landing 8 to 177 ppm off. Putting GCC's offset in front of WACD fixes most of it.

**The surprise: drift breaks long coarse correlations.** The GCC coarse step failed in 3% of noisy sessions at 17 ppm but 54% at 300 ppm, which a 20-second offset estimate shouldn't do. So I replayed the same sessions, same seeds, with the drift switched off. GCC's coarse step then failed in 0% of them, and plain correlation in 25% instead of 84%. At 300 ppm the delay moves 6 ms during those 20 seconds, about 24 times the width of the correlation peak, so the peak smears into the noise. Cutting the window to 5 seconds avoids the smear but leaves too little speech (59 to 70% fail).

**Two things went against my predictions.** At phone-level drift, re-estimating every 5 seconds did worse than holding one good first estimate (6 to 8% against 1.5 to 3%). Noisy stretches fail several windows in a row, and a median-PSR vote can't outvote them. The tracker also kept 99% of a session in sync in only 63.5% of sessions, short of the 80% predicted.

**For a rig builder.** Use GCC with envelope normalisation for the offset and a coherence-drift method or a line for the rate. Don't use a plain-correlation front end. If your clocks may differ by 100 ppm or more, the coarse search has to try clock rates as well as lags. And between re-syncs, a confident early estimate is worth more than a stream of noisy ones.

These are simulated rooms; checking on real phones waits on LibriWASN's data host, which this session could not reach. Code, logs and the full tables are in [`research/capture-sync`](../../research/capture-sync/), step 4d.
