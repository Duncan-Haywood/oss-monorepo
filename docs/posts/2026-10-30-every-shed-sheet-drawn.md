---
title: "Every 4x8 sheet in a shed, drawn"
date: 2026-10-30
tags: [shed-designer, cut-list, plans]
description: "The shed designer's plans now draw where each floor, roof and siding piece comes out of each 4x8 sheet it tells you to buy."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) has long counted the sheets of plywood and OSB a shed takes. It packs each floor, roof and siding piece into whole 4x8 sheets several ways and buys the fewest. What it didn't do was show the packing. A builder looking at "4 sheets of roof OSB" had to work out for themselves how three and a half sheets of roof come out of four. If they cut the first sheet a different way, they could find they needed a fifth.

The plan set now has a **cutting layout** sheet. It draws every sheet the shopping list buys, with each piece where it comes out of that sheet. The layout is built by the same packings that do the count, carried through with positions. A test holds the two together: across the 8 starting designs, the 11 gallery designs and 60 random designs, the drawing never needs a sheet more or fewer than the list buys. Each piece appears exactly once, inside its sheet and clear of the others. Every cut runs edge to edge, so a circular saw can make it.

**What it shows on the starting designs:**

| Design | Floor sheets (area in sheets) | Roof sheets (area) | Siding above the lower panels |
|---|---|---|---|
| 8x10 | 3 (2.50) | 4 (3.49) | 1 panel for 4 strips |
| 8x12 (default) | 3 (3.00) | 4 (3.69) | none |
| 10x12 | 4 (3.75) | 6 (5.03) | 2 |
| 12x16 | 6 (6.00) | 8 (7.58) | 2 |
| 10x10 barn | 4 (3.13) | 6 (4.78) | 4 (lap sheathing) |

The default 8x12's floor uses its three sheets with nothing left over. Its roof leaves about a third of a sheet as offcut, in two narrow strips. The 10x10 barn's roof is the loosest: six sheets for 4.78 sheets of area. Its last sheet carries just two 24" pieces. The pieces keep their strength axis across the rafters, so a 24" x 33-9/16" piece can't be turned to fit the 14" strips left on the other sheets. A quick try by hand found no five-sheet layout under that rule, though that is not a proof that none exists.

**The triangles.** When a gable is taller than an 8 ft panel, each 4 ft column takes a full panel and a piece above it. That upper piece has a sloped top, the roof line. Two such pieces sloping the same way fit head to toe on one strip of panel, the second turned end for end. The triangle cut off the first is then most of the second. The sheet count already assumed this. Now the drawing shows it, so the builder cuts them that way. Of the 19 starting and gallery designs, 8 save a panel this way, the 8x10 among them: its four gable strips come from one panel instead of two.

The sheet prints with the rest of the plans and exports to SVG and DXF like every other sheet. The code is in `cutlayout.mjs` and `cutting-sheets.mjs`.
