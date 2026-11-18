---
title: "Burst grouping that survives a wide pan: 10% pans went from 7-28% grouped to 86-95%"
seo_title: "Grouping photo bursts when the camera panned 8-10% between frames"
date: 2026-11-18
description: "ShootFlow's cull compared only one frame's centre window, so pans past 6% split bursts. Off-centre window pairs fix it: held-out pair recall 0.91 to 0.985."
tags: [photo-editing, culling, algorithms]
---

[ShootFlow's `cull` command](https://marisstella.app/photo-editing/) groups the frames of a burst so you
look at one keeper instead of five near-copies. It compares 64-bit difference hashes (dHash) of each frame,
and since this week it also hashes 25 windows of 88% of each frame, so frames the camera moved a little
between still match. This morning [it learned zooms](2026-11-18-burst-grouping-that-survives-a-zoom.md).
Wide pans were still splitting: on pairs cut from held-out real photos, a 10% horizontal pan grouped 10% of
the time, a 10% diagonal pan 7%.

## The cause was one line of design, not the threshold

The window pass held one frame at its **centre** window and compared it with every window of the other. The
windows sit on a 5 x 5 grid of offsets from 0 to 12% of the frame, so holding one side at 6% reaches content
shifts of at most 6%.

A pan moves the content further than its size suggests. If the camera keeps 90% of the scene and both frames
are scaled to the same analysis size, the content moves 10 / 90 = 11.1% of the frame. An 8% pan moves it 8.7%.
To line that up you need an off-centre window on *both* sides: frame A's window at 12% against frame B's at
0%. The old pass never compared such a pair.

## The fix: one pair per far offset

For each of the 56 offsets the centre comparison cannot reach (three or four grid steps on either axis), the
cull now compares the one pair of windows nearest the middle of both frames. The hashes were already stored,
so photos analysed since 2026-11-17 need no new analysis. Two frames up to 44 bits apart on the whole frame
now group when one of those pairs is within 5 bits and at least 6 bits closer than the whole frames.

The constants were picked on 165 photos and scored once on 166 others (the 331 JPEGs of the public
metadata-extractor-images set, burst-like pairs cut by ffmpeg). Held-out results:

| pan | 6% | 8% | 10% |
| --- | --- | --- | --- |
| horizontal | 0.86 -> 0.86 | 0.33 -> 1.00 | 0.10 -> 0.87 |
| vertical | 1.00 -> 1.00 | 0.77 -> 1.00 | 0.28 -> 0.95 |
| diagonal | 0.75 -> 0.85 | 0.15 -> 0.96 | 0.07 -> 0.86 |

Across every burst pair (pans, zooms, exposure changes) recall went from 0.914 to 0.985. Different photos
wrongly merged went from 25 to 26 of 13,695 pairs.

Comparing *every* pair of windows at each far offset (264 instead of 56) found slightly more on the tuning half
but cost 4 more false merges there, so the cull uses one pair per offset.

## Making 56 comparisons cheap

The cull compares every pair of photos, and a limit of 44 bits lets nearly every pair of distinct photos into
this pass. A first version with 56 Python-level XOR-and-popcounts per pair took 13.4 s to group 2,000 frames
that took 3.4 s before. Instead each
frame's 56 windows are packed into one integer of 64-bit lanes. One XOR compares all of them; a lane-wise
popcount (the SWAR bit trick, run on a 3,584-bit integer) plus one add and mask says whether any lane is within
the limit. It gives the same answer as the plain loop on 240,000 random checks, at about 1.8 us a pair.

That still isn't free: grouping 2,000 frames went from 3.5 s to about 7.6 s in pure Python. Decoding those
photos takes far longer than that, but it is the next thing worth cutting.

## What is still open

- 6% pans now trail 8% ones. A 6% pan moves content 6.4%, which falls between the grid's 6% and 9% steps. A
  finer grid would cover it.
- These pairs are cut from single exposures. A real burst adds subject motion, parallax and noise, and single
  linkage can chain a sunset series into one group. A real shoot with a photographer's own picks
  (`shootflow cull --picks`) is the test that settles it.

The full measurement is in the venture's `eval/cull-pan-windows-2026-11-18.md`; the code is MIT licensed.
