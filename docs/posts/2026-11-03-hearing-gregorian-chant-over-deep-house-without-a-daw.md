---
title: "Hearing Gregorian chant over deep house without a DAW"
seo_title: "Render MIDI to WAV in plain JavaScript: a no-dependency preview synth"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now renders its MIDI to audio with a small synthesiser, which showed a metal arrangement passing streaming loudness checks and a deep house one missing by 2.8 LU."
---

Chant Forge turns public-domain Gregorian chant into MIDI choir lines and builds drums, bass and chords around them in the chant's mode. Until now nobody could hear the result without opening a DAW, and the mix check needed a WAV that did not exist.

`render-cli.mjs` closes that gap. It reads the MIDI (tempo map, running status, channel programs), then plays each note through a small synthesiser: a detuned additive choir pad with an "ah" tilt, an organ drone, a low-passed saw bass, a chord pad, and kick, snare, hats and crash made from sine sweeps and noise. It writes a 16-bit stereo WAV. Nothing is installed and the output is the same every time.

Checks: a D3 note measures 146.8 Hz by autocorrelation, the length follows the tempo, and the file reads back through the existing master checker.

That checker gave the first real numbers, on *Dies irae* transposed to a D final:

| Arrangement | Loudness | True peak | Result |
|---|---|---|---|
| Deep house, 124 BPM | -16.8 LUFS | -1.12 dBTP | too quiet by 2.8 LU |
| Metal, 170 BPM, chant at half speed | -14.0 LUFS | -1.67 dBTP | all four checks pass |

One early surprise: normalising the sample peak to 0.89 left inter-sample overshoot, and true peak read -0.19 dBTP, over the -1 ceiling. Normalising to 0.8 fixed it.

What this is not: the choir is synthetic, everything sits in the centre (mono correlation 1.00), and no person has judged how it sounds. The plan is recorded singers (`RECORDING-GUIDE.md`). The renderer is for the ear check, the loudness check, and quick iteration on arrangements.

Code, MIT: [`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
