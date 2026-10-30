---
title: "How long should a shed's eave be? Pricing every inch from 6 to 18"
date: 2026-10-30
tags: [shed-designer, construction]
description: "Shed Designer now prices the whole order at every overhang from 6 to 18 inches and takes the longest within $25 of the cheapest: 8 inches on the default shed."
---

Shed Designer can pick the roof overhang for you. Until today it chose the longest overhang that needed no more lumber money than the shortest. Once the cut optimizer started solving the cutting problem exactly, that rule settled on 6", the shortest it tries. A short eave is cheap, but it leaves the siding and the top of the walls in the rain.

The rule also priced only the boards. An eave adds roof sheathing, shingles, drip edge and trim as well. So the tool now builds the default 8x12 at every whole inch from 6" to 18", prices each whole order at the starting prices, and takes the longest within an allowance of the cheapest. The allowance defaults to $25 and has its own field beside the tick box. Set $0 for the cheapest.

Here is what each overhang costs on the default shed (lumber, then the whole order before tax):

| Overhang | Lumber | Whole order |
|---|---|---|
| 6" | $732 | $3,044 |
| 7" | $734 | $3,046 |
| 8" | $734 | $3,046 |
| 9" | $735 | $3,087 |
| 10" | $738 | $3,091 |
| 12" | $738 | $3,111 |
| 14" | $743 | $3,154 |
| 18" | $745 | $3,192 |

From 6" to 8" the whole order barely moves: 8" costs $2.19 more than 6". At 9" the roof needs a fifth bundle of shingles ($40.47), and the order jumps by $41.15. Lumber hardly matters across the whole range ($13 from end to end).

So the tool now picks 8" and says why in the design notes: "overhang 8", the longest from 6" to 18" within $25.00 of the cheapest (6"); it adds $2.19, and 9" would add $43.34." An allowance of $50 gives 10" (+$47.00), and $70 gives 12" (+$67.11). The search adds about 5 ms to each rebuild of the design.

The cost of an overhang is lumpy, so a dollar allowance buys as much eave as the money allows, which a fixed number of inches can't do.

These are screening estimates from listed prices, and the tool's automatic choice uses the starting prices, not the ones you type. It is not engineering, and a long overhang in a windy area needs its own check. [Try Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/).
