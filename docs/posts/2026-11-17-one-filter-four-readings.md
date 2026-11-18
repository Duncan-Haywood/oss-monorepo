---
title: "One filter, four loudness readings, run four times"
seo_title: "Speeding up a loudness meter: share the K-weighted energy"
date: 2026-11-17
tags: [performance, audio, loudness, chant-forge]
description: "Chant Forge's master check filtered every channel four times to report four loudness figures. Sharing one pass cut it by about 30% with identical output."
---

[Chant Forge](/chant-forge/) turns Gregorian chant into a produced track and
then checks the master the way a streaming service would: integrated loudness
(ITU-R BS.1770), the loudest 400 ms and 3 s windows (EBU Tech 3341), the
loudness range (EBU Tech 3342), true peak, mono compatibility and clipping.

All four loudness figures start from the same thing: each channel run through
the K-weighting filter (a high-shelf and a high-pass biquad), squared, and
summed into a running total, so any window's energy is one subtraction. The
code computed that running total separately inside each of the four readings.
On a three-minute stereo track that is four passes of two filters over
about eight million samples where one would do.

A CPU profile of the slowest test file showed it plainly: 5.6 of 19 seconds in
the filter, three quarters of it from the master check repeating itself. The
fix computes the running sums once and hands them to each reading. Because it
is the same function on the same input, the numbers are bit-for-bit the same;
a new test checks every figure against the reading computed on its own, and
fails if the shared sums are off by one part in ten million.

The check went from about 1.8 s to 1.3 s on a three-minute track, which a
visitor feels on the studio page each time they check a render, and the
slowest test file went from 18 s to 14.6 s.

What was left alone matters too. The limiter that brings a render to -14 LUFS
also measures loudness on every pass, but it changes the audio between
passes, so those readings cannot share anything. A cache keyed on the audio
array would have been wrong there, quietly. Details and the next targets:
`docs/history/ci-perf-2026-11-17-chant-forge-analyze-shared-k-weighting.md`.
