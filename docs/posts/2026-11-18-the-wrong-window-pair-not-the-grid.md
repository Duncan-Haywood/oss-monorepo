---
title: "Split 10% pans in a photo cull: the wrong window pair, not too coarse a grid"
seo_title: "Burst grouping for 10% pans: the window pair, not the grid"
date: 2026-11-18
description: "ShootFlow's cull split one in eight 10% pans. A finer window grid looked like the fix; the pairs it already had were enough. Held out: 0.87 to 0.98."
tags: [photo-editing, culling, algorithms, evaluation]
---

ShootFlow's `cull` command groups a shoot's bursts so a photographer keeps one frame of each.
A burst is rarely a set of identical frames: the camera drifts a few percent between shots.
To catch that, each frame is hashed several times: the whole frame, plus 25 windows of 88% of it
on a 5 x 5 grid of offsets 3% apart. Two frames whose content has shifted then line up
window to window even though their whole-frame hashes differ.

On pairs cut from 331 real public photos, that worked for small pans, but a pan of 10%
split too often: held out, 87% of horizontal 10% pans grouped, 95% of vertical and 86% of
diagonal. The open item in the venture's notes said why: "windows 6-11 bits apart: a finer
grid?"

## The arithmetic said a finer grid would not help

A 10% pan keeps 90% of the scene, so between the two frames the content moves
0.10 / 0.90 = 11.1% of the frame. The grid's nearest offset is 12%. A 7 x 7 grid with 2%
steps has 10% and 12%, still about 1% off. So a finer grid lines up a 10% pan no better
than the one we have.

A short diagnostic then measured the distance with the windows placed exactly on the true
shift (under half a bit, so the hash itself is fine) and the best pair anywhere on today's
grid: within 5 bits for 99-100% of horizontal and vertical 10% pans. The windows were there
already.

## It was the choice of pair

For each offset beyond the centre window's reach, the shipped pass compared one pair of
windows, the one nearest the middle of both frames. For a horizontal shift of four grid
steps that is the middle row of five. Every 10% pan it missed but one (whole frames too far
apart) failed on that pair, while the top or bottom row at the same offset often lined up
within a few bits.

So the fix compares all 264 pairs at those offsets, not 56. More comparisons mean more
chances for two different photos to match by luck, so the extra pairs get a stricter rule:
within 5 bits and at least 10 closer than the whole frames. Picked on the 165 tune photos
(highest recall adding at most two false merges), then scored once on the 166 held out:

| held-out half | before | now |
| --- | --- | --- |
| burst-pair recall (9,462 pairs) | 0.991 | 0.995 |
| false merges (13,695 pairs of distinct photos) | 26 | 26 |
| 10% pans: horizontal / vertical / diagonal | 0.87 / 0.95 / 0.86 | 0.98 / 1.00 / 0.89 |

Nothing else went down. Catalogues analysed since 17 November get this as they are: no
new hashes and no re-analysis.

## What it costs, and what is left

Grouping got about 1.8x slower on this corpus (5,000 frames: 11.8 to 21.7 seconds), with
the groups identical whether the chunked index or the all-pairs scan finds them. That is
small next to decoding 5,000 frames, and a shoot of mostly distinct moments should cost less
than this corpus of 331 photos cut into 73 variants each.

Diagonal 10% pans stay at 0.89 because the corner offset has only one pair of windows on a
5 x 5 grid. That is the one place a finer grid would help: a 7 x 7 grid reaches 0.97 there on
the tune half, at 24 more hashes a frame and a re-analysis. All of these pairs are still cut
from single exposures, so the real test is a real shoot's bursts, with subject motion and
parallax.

Measurements and the tuning grid:
[`eval/cull-pan-all-pairs-2026-11-18.md`](../../ventures/photo-editing/eval/cull-pan-all-pairs-2026-11-18.md).
The tool: [ShootFlow](https://marisstella.app/photo-editing/).
