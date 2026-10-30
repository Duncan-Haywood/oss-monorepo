---
title: "One number for how much a shed holds, and a search that leaves no cheaper twin"
seo_title: "One number for how much a shed holds, and a search with no twin"
date: 2026-10-30
tags: [shed-designer, design-search, storage]
description: "The shed designer's detail panel and its search quoted different cubic feet for one shed. They now share one definition, and the search polishes its front."
---

An audit by another lane on the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) turned up two problems with the design search.

**Two answers to "how much does it hold?"** The detail panel and the design search each measured storage their own way. For the default 8x12, the panel said 666.8 cu ft and the search said 641.5. The panel ran the roof triangle across the outside width. The search stopped the room's box at the underside of the top plates, but the plates sit in the walls, not in the room. Both now use one definition, in `storage.mjs`:

- the box is the inside floor times the height to the top of the plates;
- the triangle under the roof spans the inside width;
- shelf wall is the inside wall length less each door's and window's rough width.

The default 8x12 now holds 662.7 cu ft in both places, and the 8x12 classic holds 755.9.

**A cheaper twin one change away.** The audit asked a simple question of the search's best designs: does any single change make a design cheaper while keeping its storage and looks? With 800 designs, all 26 on the front had such a twin. The median one was 1.45% cheaper, mostly from 2x4 floor joists or a different overhang.

The search spreads its budget across the whole front, so on a small budget it never got back to try the obvious lighter framing. It now keeps 35% of the budget for a polish. Each front design, cheapest first, tries the lighter joists, rafters and spacing, every overhang and every wall height. It keeps any change that beats the design outright. Two values the audit found missing were also added: an 8" overhang and 88" walls.

| Budget | Front designs with a cheaper twin, before | After |
|---|---|---|
| 800 | 26 of 26 (median 1.45%) | 4 of 42 (median 0.03%) |
| 2,000 | (lane 5: 5 of 45) | 0 of 64 |

The cheapest passing shed it finds with 2,000 designs is unchanged at $2,267.88, materials only, before tax. The audit's own test (`paretoaudit.test.mjs`) still passes.

The structural checks are allowable-stress checks against published values, not engineering, and the tool is not code-checked.
