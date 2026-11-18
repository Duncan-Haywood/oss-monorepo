---
title: "Burst grouping for a 10,000-photo cull: the same groups in 5.8 s instead of 115"
seo_title: "Burst grouping for a large photo cull, 20x faster in C"
date: 2026-11-18
description: "ShootFlow's cull now finds burst groups in C on every core: identical groups to the Python index, 10,000 frames in 5.8 s instead of 115 s."
tags: [photo-editing, culling, performance, algorithms]
---

[ShootFlow](https://marisstella.app/photo-editing/) culls a card of photos: it scores each frame, groups
bursts so a burst contributes one keeper, and writes star ratings Lightroom can read. Today's
work made the grouping step about twenty times faster. No grouping changed.

## Why grouping got slow

A burst is not always a set of near-identical frames. The photographer pans a few percent or zooms in
a little between shots. Over the last week the cull learned to match those: 88% windows of each frame
on a grid, off-centre window pairs for wide pans, zoom windows, and a finer grid so a 7% or 10% pan
still finds a window pair that lines up. Each of those passes adds 64-bit hashes per frame, and each
needs some pair of hashes within a few bits of each other.

Comparing every pair of photos stopped scaling early. Earlier today the cull swapped the all-pairs scan
for an exact index. It cuts each hash into thirds, and two hashes r bits apart must differ by at most
r / 3 bits in one of those thirds. So each third is looked up with every small flip, and only pairs
that could link reach the exact check. That made 10,000 frames take 42 s instead of 251 s. Then the
fine-offset pass arrived, with 49 window lookups per frame, and the same 10,000 frames went back up to
115 s. A wedding is 3,000 to 6,000 frames, so a photographer was waiting about half a minute just for
grouping, after the analysis.

## What changed

The index and the exact rule now run as one C function. Like the raw decoders, it is compiled with the
machine's own C compiler the first time it is needed, then cached. Two choices kept it honest:

- **No constants in C.** Every threshold and every table of window pairs is read from the Python
  module at call time and passed in, so tuning a limit in Python changes the C answer too. A test
  checks exactly that.
- **Every candidate gets the whole rule.** A pair found through one table is checked against all four
  passes, so the output is exactly the set of pairs the all-pairs scan would link.

Each frame's lookups are independent, so they split across threads over shared read-only tables.

## Results

Frames drawn from 30,121 burst-like variants cut from 331 public sample photos, on a 4-core machine:

| frames | Python index | C, 4 threads |
| --- | --- | --- |
| 500 | 1.19 s | 0.05 s |
| 2,000 | 7.89 s | 0.35 s |
| 5,000 | 34.4 s | 1.86 s |
| 10,000 | 114.6 s | 5.78 s |
| 20,000 (the cull's cap) | not run | 21.7 s |

The groups were identical at every size. On one thread the C path takes 21 s for 10,000 frames, so
about a quarter of the gain comes from the cores and the rest from leaving Python.

## The test that mattered

A first version read the wrong hashes for the fine pass. The 49 grid windows weren't next to each
other in memory, so some fine lanes compared zoom windows instead. The equality test against the
all-pairs scan caught it on the first run, with 101 extra pairs.

The more useful lesson came from seeding faults on purpose. Two of them still passed: one direction
of the crop match dropped, and the fine pass's gain off by one. The synthetic bursts mostly had
whole-frame distances under 8 bits, and below that line any pair links whatever the other passes say.
A new test now builds pairs with one lane of one pass exactly at its limit, or one bit past it, above
that line. All 15 seeded faults now fail it.

## Limits

This corpus has about 91 variants per photo, so the number of linked pairs grows with the square of the
sample. A real shoot's bursts of 3 to 15 frames should scale closer to linear, but no real shoot has
been measured yet. Without a C compiler, or on Windows, the cull falls back to the Python index.

Measurements and method: `ventures/photo-editing/eval/cull-grouping-native-2026-11-18.md`.
