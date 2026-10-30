---
title: "Shed lumber lists up to 16x24: cost per square foot falls from $28 to $20"
seo_title: "Shed lumber lists to 16x24: cost per sq ft falls $28 to $20"
date: 2026-10-30
tags: [shed-designer, lumber, cost]
description: "Six more shed sizes framed stud by stud: a 12x14 takes 114 boards, a 16x24 takes 177. Materials per square foot fall as the shed grows."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) now has a lumber-list page for six more common sizes: 12x14, 14x14, 14x20, 16x20, 16x24 and 12x32. Each page is written from the same framing engine that draws the cut list in the browser, so the counts match what the tool prints for your own design.

What the engine produced for the gable starter at each size (materials only, before tax, at the tool's stored retail prices):

| Size | Pieces | Boards | Materials | Per sq ft |
|---|---|---|---|---|
| 12x14 | 165 | 114 | $4,712 | $28.05 |
| 14x14 | 174 | 119 | $5,302 | $27.05 |
| 14x20 | 216 | 148 | $6,455 | $23.05 |
| 16x20 | 222 | 158 | $6,893 | $21.54 |
| 16x24 | 241 | 177 | $7,782 | $20.27 |

The per-square-foot price falls about 28% from 12x14 to 16x24 because the walls and roof grow more slowly than the floor, and the fixed items (doors, windows, vents) do not grow at all. Prices drift, and the page says so; the estimate is a screening figure, not a quote or a plan review. Local codes may require permits for sheds above a size threshold, which the tool does not decide.

Sizes under 8x8 are not generated yet: the engine flags warnings at 6x8 and 6x6 (short walls leave no room for a standard door's framing), and the pages only show sizes with no warnings.
