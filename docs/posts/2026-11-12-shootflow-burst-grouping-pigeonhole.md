---
title: "Grouping 10,000 burst frames took 34 seconds; a pigeonhole index makes it 0.4"
seo_title: "Fast exact near-duplicate photo grouping with a pigeonhole index"
date: 2026-11-12
tags: [photo-editing, shootflow, performance]
description: "ShootFlow compared every pair of photo hashes to group burst frames. Splitting the 64-bit hash into 9 blocks finds the same groups 78x faster on 10,000 photos."
---

[ShootFlow](https://marisstella.app/photo-editing/) runs overnight on a memory
card: proxies, a score for every frame, graded masters, reels. Part of the
scoring groups near-identical photos (burst frames, repeated takes) so the story
step keeps the best of each group instead of six copies of the same moment. A
photo's fingerprint is a 64-bit difference hash. Two photos are "the same shot"
when their hashes differ in at most 8 bits, and groups chain: if A is close to B
and B to C, all three are one group.

The code compared every photo with every other photo. That is fine for a test
card of 30 frames. A wedding or a sports day is thousands of frames, and the pair
count grows with the square:

| photos | all pairs | indexed |
|---|---|---|
| 1,000 | 0.38 s | 0.008 s |
| 4,000 | 5.4 s | 0.05 s |
| 10,000 | 34.3 s | 0.44 s |
| 20,000 | 139 s | 0.91 s |

(Synthetic shoots with 40% burst frames, one run each on a 4-core cloud
container. Both columns return exactly the same groups: we hashed the output.)

## The trick

Cut the 64 bits into 9 blocks of 7 or 8 bits. If two hashes differ in 8 bits or
fewer, those differences can touch at most 8 of the 9 blocks, so at least one
block is identical in both. That is the pigeonhole principle, and it means you
only need to compare photos that share a block value. Sort every photo into 9
sets of buckets, one per block, and compare within buckets. You find every close
pair the full scan found and skip almost all the rest.

It is exact, not a "probably similar" shortcut, which matters here. A grouping
that sometimes missed a pair would quietly change which frames make the reel.
The new test checks the indexed version against the old all-pairs version on
eleven shoots, including hashes exactly 8 and 9 bits apart. It fails if you cut
8 blocks instead of 9.

## Why the tests never noticed

The suite has a test that loads 10,000 analysis records, but its records carry
no hashes, so it never reached the slow loop. Real records always do: the
pipeline writes a hash for every photo it scores. The cost was invisible in CI
and fully paid on real cards. The write-up, with what we measured and what we
left alone, is in
[`docs/history/ci-perf-2026-11-12-near-duplicate-pigeonhole.md`](../history/ci-perf-2026-11-12-near-duplicate-pigeonhole.md).
