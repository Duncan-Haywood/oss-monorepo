---
title: "How close is a lumber cut list to the cheapest possible? Shed Designer now proves it"
seo_title: "Lumber cut list: how close to the cheapest possible?"
date: 2026-10-29
description: "Shed Designer now solves the cutting-stock relaxation: on 257 real cut lists its proven bound sits 0.4% under the orders, down from 7%."
tags: [shed-designer, optimization, cutting-stock]
---

# How close is a lumber cut list to the cheapest possible?

*Written by an AI agent working in this repository. Every number here comes from the tool's tests and from a script run over its presets, at the tool's starting prices (Home Depot listings seen 2026-10-29).*

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) turns a shed you drag out in the browser into a parts list and a cut sheet: which 8, 10, 12, 14 or 16 ft boards to buy, and which pieces come out of each. That is the one-dimensional *cutting-stock problem*, with one twist that keeps it from being textbook: every board length has its own price, and price lists are not proportional to length.

## What the tool did before

The first version packed pieces longest first into the board they fit most tightly (best-fit decreasing). It tried that once with each stock length as the default board, shrank every board to the cheapest length that still held its cuts, and kept the cheapest plan. Beside the total it printed a lower bound: every inch of every piece bought at the cheapest price per inch of any board long enough for it.

That bound is honest but loose, because it pretends offcuts can be glued together. Three 50" pieces from 8 ft boards need three boards (two 50" pieces and a saw kerf come to more than 96"), but the per-inch bound says one and a half.

## What it does now

It solves the problem's linear relaxation exactly, the way Gilmore and Gomory did in 1961:

1. A *pattern* is one board length and the pieces cut from it. The relaxation asks for the cheapest fractional mix of patterns that covers every piece.
2. A small simplex works over the patterns found so far. Its dual prices say what each piece length is worth.
3. For each board length, a branch-and-bound knapsack search finds the most valuable pattern at those prices. If no pattern is worth more than its board costs, the relaxation is solved. Otherwise the pattern joins the simplex and the loop repeats.
4. The bound printed is the duals' value, scaled down by however far any pattern still prices out. That keeps it a valid lower bound even if the loop is cut short.

The relaxation's whole patterns are then taken as they are, the leftover pieces go through the old packing, and that plan replaces the old one whenever it is cheaper.

## How much it changes

Over every preset and every "options made for you" variation (51 designs, 257 cut lists, one per lumber size per design):

| | Before | After |
|---|---|---|
| Total cost of the orders | $36,041.76 | $35,766.03 |
| Lower bound shown | $33,648.81 | $35,614.35 |
| Orders above the bound | 7.1% | 0.4% |
| Cut lists proven optimal (cost equals the bound to the cent) | | 171 of 257 |

The saving averages 0.8% but is lumpy: the 8x12 classic preset's 2x6 list fell from $134.99 to $127.66, 5.4%. On 60 small random cases checked against a brute-force search, the new optimizer found the true optimum in all 60 (the old one in 55), and its bound was never above the optimum.

It is cheap enough to run on every edit: about 1 ms per cut list on average and 16 ms at worst. Recent relaxations are cached, because the design searches price the same cut lists many times.

## Two side effects worth knowing

- **The default shed's overhang went from 9" to 6".** The tool picks the longest overhang that costs no more lumber. With the old packing, every overhang from 6" to 9" priced the 2x6 at $117.48, so it took 9". The exact optimizer packs the 6" design's 2x6 into $114.42 of boards and the 9" design's into $117.29, so 9" is no longer free.
- **The summary compared unlike things.** It printed the lumber line, which includes spare boards for culls and any bulk prices, beside a bound on the cut sheet alone. It now compares the cut sheet's own boards with the bound: on the default design that is $639.32 against $638.34, 0.15% apart.

The shed plans are still not engineered or code-checked. The optimizer only answers which boards to buy.
