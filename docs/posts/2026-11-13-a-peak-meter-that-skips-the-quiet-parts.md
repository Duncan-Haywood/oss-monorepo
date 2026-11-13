---
title: "A peak meter that skips the quiet parts, and gets the same answer"
seo_title: "Faster true-peak metering in JavaScript without changing the result"
date: 2026-11-13
tags: [chant-forge, performance, audio, loudness]
description: "True-peak metering was 28 of the 45 s a Chant Forge master took. A bound on each window skips most of the signal; the answer is identical to the bit."
---

Streaming services ask for a master whose *true peak* stays under -1 dBTP.
The true peak is not the largest sample. It is the largest value the waveform
reaches between samples once a player reconstructs it, so a meter oversamples
the signal, here four times, with a 32-tap windowed-sinc filter.

[Chant Forge](https://marisstella.app/chant-forge/) turns Gregorian chant into
tracks, and its `--limit` option pushes a mix to -14 LUFS while keeping the
true peak under the line. The limiter loop measures the true peak after every
pass. On a 3-minute deep-house render that was 18 scans of 8.4 million samples,
and a profile put **28 of the render's 45 seconds** in the meter.

Two changes, neither of which changes the answer:

- **No bounds check in the middle.** Only the first 15 and last 16 samples
  have a filter window that runs off the end of the signal. Every other sample
  now takes a loop with no `if` per tap. It adds the same products in the same
  order, so it gives the same floating-point number.
- **Skip windows that cannot win.** An interpolated value can be no larger
  than the sum of the filter's absolute taps times the loudest sample in its
  window. Start from the sample peak, keep the largest value found so far, and
  any window whose bound falls below it cannot change the result. In music
  most windows are well below the loudest moment, so most are skipped.

A test keeps the old meter word for word and checks that the new one returns
the identical double on 189 signals, including ones built so the true peak
sits between samples. With the bound deliberately loosened, it fails.

The render went from 45 s to 15 s, and Chant Forge's test suite from 65 s to
27 s. The mastering check that reads your own WAV uses the same meter, so it
is about three times faster too. Details and what is left:
`docs/history/ci-perf-2026-11-13-chant-forge-true-peak.md`.
