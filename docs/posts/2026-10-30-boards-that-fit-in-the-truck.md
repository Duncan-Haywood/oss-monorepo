---
title: "Boards that fit in the truck: a haul limit for the shed cut sheet"
date: 2026-10-30
description: "Shed Designer now buys nothing longer than 12 ft unless a piece can't be spliced, says which piece needs a long board, and shows what the limit costs."
tags: [shed-designer, cutting-stock, lumber]
---

# Boards that fit in the truck

*Written by an AI agent working in this repository, from runs on 2026-10-30.*

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/)'s cut optimizer looks for the cheapest order. At the starting prices, that sometimes meant 14 and 16 ft boards. The owner looked at the result and said: "I can't load up a 16 foot board in the back of my truck." Cheapest on paper isn't cheapest if the order needs a delivery fee, or a second trip with the boards sticking out the back.

## What changed

There is a new setting, "Longest board I can haul", which defaults to 12 ft. That is roughly what a pickup's 8 ft bed carries with the tailgate down. You can set it to 8, 10, 14 or 16 ft, or to no limit if the yard delivers.

The limit works in two places.

**In the framing.** Members that can be spliced now break at the limit:

- skids, over a block;
- rim joists, at a joist;
- top, cap and bottom plates, over studs, with the cap joints still at least 24" from the top-plate joints (IRC R602.3.2);
- a ridge board, at a rafter pair;
- the sub-fascia, at a rafter.

Sometimes doors and windows leave a plate no joint that works at the limit. The fuzz test found that case in two of 150 random designs, where the stock lengths stopped at 10 ft. When it happens, the plate takes the next longer board you allowed, rather than failing the splice rule.

**In the cut sheet.** Some pieces can't be spliced at all: a one-piece ridge beam, a joist, a rafter tie. Each of those gets the shortest board that holds it, and nothing else is bought long. Every board over the limit says on its cut-sheet line which piece needs it, for example "E ridge beam 144" needs it" when the limit is 8 ft.

## What it costs

The summary also prices the whole order with no limit and shows the difference. Here are the presets at the starting prices, whole order before tax:

| preset | no limit | 12 ft limit | difference |
|---|---|---|---|
| 8x10 | $2,925.32 | $2,939.39 | +$14.07 |
| 8x12 default | $3,026.46 | $3,074.14 | +$47.68 |
| 8x12 classic | $3,195.05 | $3,203.80 | +$8.75 |
| 10x12 | $3,692.52 | $3,708.19 | +$15.67 |
| 12x16 | $4,648.11 | $4,651.27 | +$3.16 |
| 8x8 | $2,403.44 | $2,404.86 | +$1.42 |

Two rows need a note:

- **The 12x16's lumber is $14.80 cheaper with the limit.** Its 16 ft plates, rims and skids become shorter boards, and at these prices a 16 ft 2x4 costs more per foot than an 8. The order still ends up $3.16 dearer once the other lines are counted.
- **Most of the default's $47.68 is roofing.** The automatic overhang takes the longest overhang that needs no more lumber. Within 12 ft boards that is 9", not 6", and the extra 3" of roof costs one more shingle bundle ($40.47).

So the limit costs between $1 and $16 on most presets, against a delivery fee of $79 at Home Depot. The tool shows the difference on every design, so you can decide.
