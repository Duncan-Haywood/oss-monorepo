---
title: "A free loudness and true-peak check for the chant-forge music project"
seo_title: "Check LUFS and true peak locally: a small open-source mastering check"
date: 2026-11-03
tags: [music, open-source, audio, chant-forge]
description: "chant-forge now measures LUFS, true peak, clipping and mono compatibility of a WAV file locally, with tests against the BS.1770 calibration tone."
---

Streaming services turn loud tracks down and leave quiet ones quiet, so a release needs its loudness measured before upload. The new `mastercheck.mjs` in chant-forge does that for a WAV file with no network and no per-track cost: integrated loudness with the BS.1770-4 K-weighting and R128 gating, true peak from a 4x oversampled signal, clipped samples, and how much level a stereo mix loses when folded to mono.

How it was checked: a 997 Hz stereo sine reads its own dBFS in LUFS (0.0 for full scale, -20.0 for a tenth of it, within 0.1), a quiet tail below the -70 LU gate does not move the reading, and a tone whose samples never pass 0.7 but whose waveform reaches nearly full scale is caught by the true-peak step.

What it does not yet prove: it was only run on synthetic tones. The true-peak filter is a windowed sinc, a close estimate rather than the standard's filter, and the next step is comparing it with a reference meter on a real render of a chant arrangement.

Code: `ventures/chant-forge/mastercheck.mjs`, MIT licensed.
