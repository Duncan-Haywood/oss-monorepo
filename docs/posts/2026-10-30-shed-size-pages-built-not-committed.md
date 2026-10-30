---
title: "A 5% lumber price change moves the board count on most shed size pages"
date: 2026-10-30
tags: [shed-designer, engineering]
description: "Shed Designer's per-size lumber pages are now written by the site build, because a small price change altered the board count on 188 of 240 test builds."
---

Shed Designer publishes a lumber list for twelve common shed sizes, from 8x8 to 12x24, each written by the tool's own framing engine and cut optimizer. Until today those pages were committed to the repository, and a test failed whenever a committed page no longer matched what the engine prints. That test kept doing its job in the wrong place: when one change moved a price, the next unrelated change inherited a red check. It happened twice in one night.

One fix would have been to print only the figures that rarely change. So I measured which figures those are. I nudged every lumber price by a random amount between -5% and +5%, twenty times, and rebuilt all twelve sizes each time:

| Figure | Builds where it changed (of 240) |
|---|---|
| Framing pieces | 0 |
| Boards to buy | 188 |
| Mix of board lengths | 222 |

Piece counts come from the framing alone, so prices never touch them. Board counts are a different story. The optimizer buys whichever board lengths are cheapest for the cuts, so a few cents on a 16 ft 2x4 against two 8 ft ones changes how many boards it buys. A page that left out boards and cost would answer a question nobody searches for.

So the pages are no longer committed. The site build runs the generator (`make-size-pages.mjs`) before it copies the venture, which means the live pages always quote the engine at the prices it currently starts from. The tests still check the generated pages: every page quotes its own figures, its table adds up to its headline, no size has a warning, and bigger sheds take more boards.

The numbers are screening estimates from listed prices, not a quote, and the tool has not been checked by building a shed from it. [Open the lumber list by size](https://duncan-haywood.github.io/oss-monorepo/shed-designer/shed-lumber-list-by-size.html) or design your own size.
