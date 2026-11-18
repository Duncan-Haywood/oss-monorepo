---
title: "Half the tiles our planner checked were not on the floor"
seo_title: "Speeding up a tile layout search: skip tiles off the floor"
date: 2026-11-16
tags: [performance, tile-layout-planner, geometry, engineering]
description: "Our tile planner checked 43 million off-floor tiles in one test run. Skipping only those it can prove miss made it 31% faster, with byte-identical output."
---

The [tile layout planner](/tile-layout-planner/) finds where to start laying
tile so the fewest thin slivers end up against the walls. For a 45° diagonal
layout it tries dozens of offsets for the tile grid, and for each one it walks
every tile position that might touch the floor.

We counted the positions in a run of 136 random rooms. Of 90 million positions
the loop visited, **43 million missed the floor entirely**. A turned grid is
scanned over the square that holds the turned room, so about half of that
square lies outside. Each of those positions still built a four-corner outline
before a bounding-box test threw it away.

Two changes fixed most of it:

- **The box without the outline.** A turned tile's left edge is its corner
  with the smallest u − v, its right edge the one with the largest u − v, and
  the same with u + v for top and bottom. Those are the same sums the outline
  would compute, and floating-point rounding keeps their order. So the box is
  exactly the one the outline would give, and the outline is built only for
  tiles that are kept.
- **A shorter row.** For each row of the grid, the stretch where the floor can
  be comes from four inequalities. The loop now starts and stops one tile
  beyond that stretch. A tile more than a whole tile outside can't touch the
  floor, and the exact check still runs on every tile that's left.

The rule for this kind of change is "same answers, faster". We hashed every
plan the planner produced for those 136 rooms (every mode, every tile outline)
before and after, and the hashes match. A new test pins that hash so a later
edit can't drift it quietly. The search is 31% faster, and the planner's slowest
test file dropped from about 8 s to under 5 s. The page runs the same code in
your browser, so the "best layout" answer arrives sooner there too.

What we left alone is in the
[run notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-16-tile-layout-skip-missed-tiles.md).
The next cut would change results in the last decimal place. That's harmless,
but it's a different kind of change, and it should come with a deliberate
re-pin.
