---
title: "Burst grouping that survives a zoom: 10% zoomed frames went from 40% grouped to 99%"
seo_title: "Grouping photo bursts when the camera zoomed between frames"
date: 2026-11-18
description: "ShootFlow's cull now checks each frame against smaller windows of its neighbour, so frames zoomed 3-10% tighter stay in one burst. Held-out: 0.72 to 0.91."
tags: [photo-editing, culling, algorithms]
---

When you cull a shoot, a burst should cost you one look, not five. [ShootFlow's
`cull` command](https://marisstella.app/photo-editing/) groups near-identical frames by a 64-bit
difference hash (dHash) and keeps the sharpest frame of each group. Yesterday it learned to
match frames the camera panned a few percent between, by hashing 25 windows of 88% of each
frame and comparing them. Pans grouped well after that. Zooms didn't: a frame 10% tighter than
its neighbour grouped only 36-43% of the time, and the [cull report on ShootFlow's
page](2026-11-17-shootflows-page-now-shows-a-real-cull-report.md) showed a 4% reframe sitting
in a group of its own.

## Why equal windows miss a zoom

If frame B is frame A zoomed in by 10%, B shows the same content as a window of A that is 90%
of A's size. Equal-size windows can shift to follow a pan, but they can't change scale, so they
only roughly line up with a zoom. The fix is to hash windows of the sizes a zoom produces:
96, 94, 92 and 90% of the frame, each at 5 x 5 positions from corner to corner. Then B's whole
frame is compared with A's windows, and A's whole frame with B's, because either one can be the
tighter shot. A pair groups when some window is within 6 bits and at least 6 bits closer than the
two whole frames. That second condition keeps distinct photos apart: for unrelated photos the best
of 100 windows is barely better than the whole frame.

## How it was measured

The test set is the same as yesterday's: 331 real photos from many cameras (the
`metadata-extractor-images` sample set), each cut by ffmpeg into burst-like pairs, with every pair
of two different photos counted as a negative. The constants were picked on half the photos, then
scored once on the other half. Two kinds of zoom were added before that scoring, so the pick could
not have been fitted to them: crops whose sizes match none of the windows (5, 7, 9%), and crops
placed between the grid positions.

| held-out photos | pair recall | false merges in 13,695 distinct pairs |
| --- | --- | --- |
| whole frame only | 0.44 | 21 |
| plus pan windows (2026-11-17) | 0.72 | 23 |
| plus zoom windows (today) | 0.91 | 25 |

Zooms of 3-10% now group 98-100% of the time, the off-size and off-grid ones included (they were
40-57% at 9-10%). In the showcase the 4% reframe joins its burst: 5 groups for 5 scenes. The two
added false merges are what you'd expect: different photos with the same layout, a dark ground
under a bright sky.

## Keeping it fast

Comparing 100 windows for every pair within 28 bits is the expensive part. Thirty percent of
distinct-photo pairs fall inside that limit, which put a 2,000-photo cull at about 7 s of grouping.
So each frame's windows are cut into 16 blocks of neighbours. Each block stores its medoid and a
radius, and by the triangle inequality no member can be closer than the distance to the medoid
minus the radius. A block that can't reach the limit is skipped. On these photos that skips 86% of
the scans, and the result is exactly the same: identical groups, with a randomized test checking it
against the full scan. A hard 1,986-frame set went from 6.5 s back down to 2.8 s.

## What it doesn't do

The pairs are cut from single exposures, so they don't include subject motion, parallax or focus
breathing. Pans of 8-10% are still mostly split, because zoom windows are the wrong shape for them.
The real test is a photographer's own picks from a real shoot, which `shootflow cull --picks FILE`
scores. The full write-up is in
[`eval/cull-zoom-windows-2026-11-18.md`](../../ventures/photo-editing/eval/cull-zoom-windows-2026-11-18.md).
