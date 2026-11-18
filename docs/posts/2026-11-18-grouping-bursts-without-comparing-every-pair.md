---
title: "Grouping 10,000 photos into bursts without comparing every pair"
seo_title: "Fast burst grouping for photo culling: a chunked hash index"
date: 2026-11-18
description: "ShootFlow's cull compared every pair of photos to find bursts. A pigeonhole index on hash chunks gives the same groups 6x faster at 10,000 frames."
tags: [photo-editing, culling, algorithms, performance]
---

[ShootFlow](https://marisstella.app/photo-editing/)'s `cull` command groups a shoot into bursts so
each burst keeps one frame. Over the last two days its grouping learned to match frames the camera
panned or zoomed a few percent between, by comparing small windows of each frame as well as the
whole frame. That raised recall on burst-like pairs from 0.40 to 0.99, but it left one cost behind:
the grouping compared every pair of photos, and once the window checks let almost any pair through
to the expensive comparison, time grew with the square of the shoot. 2,000 frames took about 10
seconds; 10,000 took 251.

## Why the obvious shortcut fails

The usual trick for skipping comparisons is a triangle-inequality bound: if two frames' centre
windows are far apart, and every window of each frame is close to its centre, no window pair can be
close. On 1,000 frames that bound ruled out about 10,000 of the 495,092 pairs it was asked about,
while only 1,087 of them actually linked. A frame's farthest window sits a median 26 bits (of 64)
from its centre, so the bound almost never bites.

## What works: chunks and the pigeonhole principle

Every way two frames can join a burst needs some pair of 64-bit hashes within a few bits of each
other: the whole frames within 8, a centre window within 6 of one of the other frame's windows, a
whole frame within 6 of one of the other's zoom windows, or a pair of offset windows within 5.

Cut each hash into three chunks of 21-22 bits. If two hashes differ in at most 6 bits, at least one
chunk differs in at most 2 of them. So the cull stores every window under its three chunks, and for
each frame looks up its centre window's chunks with every flip of up to 2 bits: 254 keys per chunk.
Anything it can link is in those buckets, and nothing else needs an exact check.

On 2,000 frames that leaves 211,555 candidate pairs out of 2.0 million. Each pass then runs its
unchanged exact rule on its own candidates, so the groups are the same as before, and a test checks
that against the old all-pairs scan on bursts built to exercise every kind of match.

| frames | every pair | index |
| --- | --- | --- |
| 1,000 | 2.3 s | 1.4 s |
| 2,000 | 10.0 s | 3.6 s |
| 5,000 | 63 s | 13 s |
| 10,000 | 251 s | 42 s |

Times are from a 4-core cloud container on frames cut from 331 public sample photos; the groups
were identical at every size. Below 500 photos the two tie, so small folders keep the old scan.

## What it does not tell you

The test frames are dozens of crops of each of 331 photos, so true matches are far denser than in a
real shoot, which has short bursts among thousands of distinct moments. A real shoot should gain
more, not less, but that has not been measured: the cull has still not been run on a photographer's
full shoot or compared with their picks.

The measurements and the method are in
[eval/cull-grouping-index-2026-11-18.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-grouping-index-2026-11-18.md).
ShootFlow is free and MIT licensed, and it runs on your own machine; nothing is uploaded.
