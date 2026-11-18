---
title: "The cull split 7% and 9% pans because nobody tested them: windows at every whole percent"
seo_title: "Burst grouping for panned photos: windows at every 1% offset"
date: 2026-11-18
description: "ShootFlow's burst grouping matched windows on a 3% grid, so pans that moved content between steps split. 24 more windows: held-out recall 0.982 to 0.998."
tags: [photo-editing, culling, algorithms, evaluation]
---

ShootFlow's `cull` command groups the frames of a burst so a photographer sees one keeper
per moment, not twelve near-copies. Two frames of a handheld burst are rarely identical: the
camera drifts a few percent between shots. So the grouping compares 88% windows of each frame
as well as the whole frame, and a pan lines up again window to window.

The windows sat on a 3% grid (0, 3, 6, 9 and 12% of the frame). The eval tests pans of 2, 4,
6, 8 and 10%, and after this morning's fixes all of them grouped at 0.96 to 1.00 except 10%,
at 0.86 to 0.95.

## The residue

A pan of s keeps 1 - s of the scene, so once both frames are scaled to the same size the content
has moved s / (1 - s) of the frame. For 10% that is 11.1%, 0.9% short of the grid's 12%. On the
missed pairs the best grid window pair was 6 to 11 bits apart, and the pass needs 5. The window at
the nearest whole percent was 0 to 2 bits apart for 29 of the 33.

How close is close enough? Cutting one window at the true offset minus a small residue, on 294
horizontal and 294 diagonal pans, and counting how often it stayed within 5 bits:

| residue (% of frame) | 0 | 0.5 | 1.0 | 1.5 |
| --- | --- | --- | --- | --- |
| horizontal pans | 1.00 | 0.98 | 0.82 | 0.54 |
| diagonal pans | 1.00 | 0.95 | 0.68 | 0.34 |

The windows have to land within about half a percent. A 3% grid can be 1.5% off. The round pan
sizes in the test happened to sit near grid points (6% pans move the content 6.4%, 8% pans 8.7%),
so the test never showed the gap. A 7% pan moves it 7.5%, right between 6 and 9. Added to the
test before any tuning, 7% diagonal pans grouped 0.84 and 9% diagonal pans 0.78.

## The fix: a sparse ruler

The cheap way to get 1% offsets is not a 13 x 13 grid of windows. The offset between two windows
is the difference of their positions, and the marks 0, 1, 2, 3, 6, 9, 12 have every whole number
from 0 to 12 as a difference: a sparse ruler. So 24 more windows per frame (at 1% and 2% on each
axis, on top of the existing 25) give a window pair for every whole-percent offset. No pan up to
the margin is more than half a percent off one. The 544 new offsets are compared in one packed
XOR-and-popcount over 64-bit lanes, as the other window passes are.

The threshold, gain and gate were picked on the even-numbered half of 331 real photos and scored
once on the odd half:

| held-out half | before | after |
| --- | --- | --- |
| burst-pair recall (10,956 pairs) | 0.982 | 0.998 |
| 7% / 9% / 10% diagonal pans | 0.84 / 0.78 / 0.86 | 0.99 / 1.00 / 1.00 |
| false merges (13,695 pairs of different photos) | 26 | 26 |

## What it cost

Grouping is about 2.7 times slower: 10,000 frames take 101 s instead of 36. Analysing those
frames takes about 20 minutes, so grouping is about 8% of the run. Catalogues analysed before
today have no fine windows and group exactly as before until they are re-analysed.

These pairs are cut from single photos. Real bursts add subject motion, parallax and focus
breathing, and the cull has still not been run against a photographer's own picks. That is the
next thing worth measuring. Method and full numbers:
[eval/cull-fine-offsets-2026-11-18.md](../../ventures/photo-editing/eval/cull-fine-offsets-2026-11-18.md).
