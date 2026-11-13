---
title: "Two filters, one loop, the same doubles: speeding up a loudness meter without changing a bit"
seo_title: "Fusing K-weighting biquads in JavaScript, bit for bit"
date: 2026-11-13
description: "Chant Forge's limiter measures LUFS and true peak eight times a render. One fused filter loop and reused buffers cut it by a quarter, byte for byte."
topic: infrastructure
tags: [performance, profiling, nodejs, audio, loudness, chant-forge]
---

# Two filters, one loop, the same doubles

[Chant Forge](https://marisstella.app/chant-forge/) renders a Gregorian chant
over a dance or metal backing and can master it to a loudness target:
`--lufs -14 --limit` pushes the gain up, pulls the drum transients back with a
lookahead limiter, and checks the result against -14 LUFS and a -1 dBTP true
peak ceiling. It tries up to eight passes, and on our deep-house test piece it
uses all eight. Each pass measures integrated loudness (BS.1770) and the true
peak of both channels on about 8.4 million samples a channel.

This morning a first pass made the true-peak meter skip windows that cannot
raise the peak. This afternoon's profile of the same render showed what was
left:

| function | self time |
|---|---:|
| `truePeak` | 4.75 s |
| `renderMidi` | 3.74 s |
| `biquad` (K-weighting) | 3.02 s |
| `limiterCurve` | 2.14 s |
| the sum-of-squares loop in `integratedLufs` | 1.11 s |

## The rule: same answers

A speed-up only counts if the output does not change, so the bench hashes
the rendered mix, every stem, the reported loudness and the full analysis
JSON (`530a7b97baa28bdd` before and after). That rules out the tempting
changes, like rearranging a filter into a different but "equivalent" form:
floating-point addition is not associative, and the hash would move.

## Three changes that keep every double

**Fuse the K-weighting filters with the energy sum.** BS.1770 loudness runs the
signal through a high shelf, then a high-pass, then sums squares over 400 ms
blocks. The code did that as three loops over three 67 MB arrays. The
high-pass's input history is just the shelf's output history, so one loop can
carry both filters and the running sum in six local variables:

```js
const v = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;   // shelf
const w = c0 * v + c1 * y1 + c2 * y2 - d1 * z1 - d2 * z2;    // high-pass
x2 = x1; x1 = xi; y2 = y1; y1 = v; z2 = z1; z1 = w;
acc += w * w; s[i + 1] = acc;
```

Every product and sum is the one the old code computed, in the same order.
A new test checks the fused output against the old three-step path with
`Object.is` on every element, and swapping two terms of one sum makes it fail.

**Reuse the pass buffers.** Each limiter pass scaled the mix by its gain with
`base.map((v) => v * g)`, allocating two fresh 67 MB arrays. Writing into two
buffers allocated once gives the same values without the allocation or the
garbage collection.

**Measure the second channel against the first.** The true peak of a stereo
file is the larger of the two channels. The meter already skips a window whose
bound is below the peak found so far, so starting channel two at channel one's
peak lets it skip more. A test pins `truePeak(x, 4, 16, floor)` to
`Math.max(floor, truePeak(x))` exactly, NaN included.

## What it bought

The render went from 15.5 s to about 11.9 s on a 4-core container, with the
same hash; the analysis of the result from 1.6 s to about 1.3 s.
`kWeightedEnergy` takes 1.9 s where `biquad` plus the sum took 4.1 s. The
whole chant-forge test suite went from 26.3 s to 20.9 s; the details are in
[the perf note](../history/ci-perf-2026-11-13-chant-forge-fused-k-weighting.md).

The true-peak meter barely moved, and the reason is worth knowing: its skip
test compares a bound (about 1.6 times the loudest sample in a window) against
the peak so far. After a limiter has pushed most of the track up to the ceiling,
almost no window falls below that, so almost none are skipped. A limited master
is the worst case for that trick, and the remaining time is the 3 x 32
multiply-adds a sample it really has to do.
