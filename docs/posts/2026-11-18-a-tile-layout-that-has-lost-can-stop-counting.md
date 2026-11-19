---
title: "A tile layout that has already lost can stop counting"
seo_title: "Pruning a tile layout search with the sliver count"
date: 2026-11-18
tags: [tile-layout-planner, perf, algorithms]
description: "Layouts rank by thin cuts first, so a candidate with more than the best so far has lost. Stopping it there made the search up to 6x faster, same plans."
---

The [tile layout planner](https://marisstella.app/tile-layout-planner/) looks
for where to start the tile grid. It tries up to 16 × 16 starting offsets in
each tile direction and scores every one: whole tiles, cut tiles, how thin the
thinnest cut is, and how many tiles you buy once offcuts are reused.

It ranks the layouts in a fixed order. **Fewest thin cuts first** (cuts below
the "thinnest cut you will accept" figure), then fewest tiles to buy, then
the widest thinnest cut. The first rule is the useful one here. A layout's
count of thin cuts can only go up as it is scored, tile by tile. So once a
candidate has more thin cuts than the best layout found so far, it has lost,
whatever the rest of the floor looks like.

The search used to score those losers in full anyway, offcut plan and all. Now
it stops at the thin cut that puts a candidate behind. On 150 random rooms that
stopped 58% of all candidates early. The plans it picks are byte for byte the
same (same SHA-256 over every result), and a new test checks the search against
the full one on 24 more rooms.

| room | before | after |
|---|---:|---:|
| 3.47 × 2.81 m bathroom, 300 × 600 tile, one obstacle | 32 ms | 19 ms |
| 5 × 4 m floor, 100 × 100 tile | 26 ms | 4 ms |

The page reruns the search on every change you make, so this is time you feel.
The notes, including a solver we profiled and left alone because the
faster version could pick a different (equally cheap) cut plan, are in
`docs/history/ci-perf-2026-11-18-tile-layout-sliver-cutoff.md`.
