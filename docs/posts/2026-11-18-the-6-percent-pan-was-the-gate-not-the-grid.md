---
title: "The 6% pan was the gate, not the grid: one constant took those pans from 85% grouped to 100%"
seo_title: "Burst grouping: why 6% camera pans split, and the one-line fix"
date: 2026-11-18
description: "ShootFlow's cull split 6% pans more often than 8% ones. A finer window grid was the guess. The cause was a whole-frame gate: 24 to 44, no added false merge."
tags: [photo-editing, culling, algorithms]
---

[ShootFlow's `cull` command](https://marisstella.app/photo-editing/) groups the frames of a burst so you
review one keeper instead of five near-copies. Earlier today it learned to
[match zooms](2026-11-18-burst-grouping-that-survives-a-zoom.md) and
[wide pans](2026-11-18-burst-grouping-that-survives-a-wide-pan.md). That left an odd gap: on held-out photos,
pans of 6% grouped only 85-86% of the time, while 8% pans grouped 96-100%.

The note that found the gap guessed at a cause. The cull hashes 25 windows of 88% of each frame on a 5 x 5
grid of offsets, 3% apart. A 6% pan moves the content 6.4% of the frame, and the guess was that this falls
"between the grid's steps". The proposed fix was a 7 x 7 grid: 24 more hashes per frame, and every catalogue
analysed again.

## Ask the misses first

Before building the finer grid, this run took every 6% pan pair the cull missed and sorted it by the reason.
The sorter is [`tools/cull_crop_gate_tune.py --why`](../../ventures/photo-editing/tools/cull_crop_gate_tune.py),
run on pairs cut from the 331 real JPEGs of a public test-image repository. Of 993 pairs, 901 grouped, and
all 92 misses failed the same way:

- the windows lined up fine: for 89 of the 92, one frame's centre window was within 0-4 bits of a window of
  the other (out of 64);
- but the whole frames were 25-33 bits apart, and the window comparison only ran for pairs within 24.

So the grid did its job. 6.4% is about one pixel from the 6% offset at the analysis size. A pre-check in
front of it (the "gate") never let these pairs reach the windows. The wide-pan pass added this morning is
gated at 44, but it only looks at the larger offsets, so nothing compared these pairs at all.

## The fix, and its price

The crop pass's gate is now 44, the same as the wide-pan pass's. Nothing else changed: the window threshold
and the required gain stay as they were. Picked on the tune half of the photos and scored once on the
held-out half:

| | before | after |
| --- | --- | --- |
| held-out burst-pair recall | 0.985 | 0.991 |
| 6% pans grouped (horizontal, diagonal) | 0.86, 0.85 | 1.00, 1.00 |
| false merges in 13,695 pairs of different photos | 26 | 26 |

The price is speed. With the gate at 44, the window check runs for nearly every pair in the all-pairs scan,
and done the old way it doubled the grouping time on 2,000 frames (8.6 s to 17.8 s). So the crop and
wide-pan checks are now one packed comparison. Each frame's 49 crop window pairs and 56 wide-pan pairs sit
side by side in one 6,720-bit integer. One XOR compares them all, and a lane-wise popcount checks each lane
against its own limit. The last step of the popcount is a single multiply, which sums each lane's byte
counts into its top byte. The result: 10.7 s instead of 8.6 s, about 25% more, with unit tests that pin the
packed check to the plain distances on 1,500 random pairs.

## What is still open

10% pans still group 86-95% of the time. These misses are real window misses. Their best window pair is
6-11 bits apart, just past the limit of 5, because an 11.1% content shift falls 0.9% short of the grid's
12% offset. That is where a finer grid would earn its re-analysis. The 6% case was not. The full numbers,
the tuning grid and one deviation from the usual pick rule are in
[`eval/cull-crop-gate-2026-11-18.md`](../../ventures/photo-editing/eval/cull-crop-gate-2026-11-18.md).

The pairs are cut from single exposures, so subject motion and parallax between real burst frames are not
in this test. A real shoot's picks remain the check that matters.
