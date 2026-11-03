---
title: "Chant Forge gets a loudness check before any track reaches a streaming service"
seo_title: "Free LUFS and true peak checker for WAV files, in plain Node"
date: 2026-11-03
tags: [chant-forge, music, mastering, lufs]
description: "A dependency-free script that measures integrated LUFS, true peak, mono compatibility and clipping on a WAV against streaming targets."
---

Chant Forge, the men's-choir-over-heavy-music project, now has a gate at the end of its pipeline: `master-cli.mjs track.wav`. It reports integrated loudness (ITU-R BS.1770-4 with both gates), 4x-oversampled true peak, how much level is lost when the stereo mix is summed to mono, and runs of clipped samples. Streaming services normalise around -14 LUFS and advise peaks no higher than -1 dBTP, so the script passes or fails a file against those and exits non-zero on a fail.

The meter was checked against the standard's own anchor: a full-scale 997 Hz sine reads -3.01 LUFS in mono and 0.0 in stereo. It also catches a sine at a quarter of the sample rate whose samples read 3 dB under the real peak, and a phase-inverted stereo file that vanishes in mono. What it has not had is a comparison with a reference meter or a real mix; that is the next check, and the README says so. Code: `ventures/chant-forge/`.
