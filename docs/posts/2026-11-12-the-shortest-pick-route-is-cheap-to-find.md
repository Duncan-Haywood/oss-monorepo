---
title: "The shortest pick route is cheap to find, and batching matters more"
seo_title: "Exact pick routes vs S-shape and largest gap, and order batching"
date: 2026-11-12
tags: [pick-path-optimizer, ventures, operations-research, warehouse]
description: "A free pick route and batching tool runs the exact Ratliff-Rosenthal method. On invented orders, grouped carts cut walking about 71%; routing alone, 13%."
---

Most small warehouses pick the same way. A pick list comes out of the shop or the warehouse system sorted by location, someone takes one order and walks it, and when the list says aisle 3 then aisle 7, they go up aisle 3 and down aisle 7 because that is what the list suggests. Walking is most of a picker's day in a shelf-picked warehouse, so this matters, and there are two levers that cut it without moving any stock: walk each trip by a better route, and carry several orders per trip.

The new [pick path optimizer](https://marisstella.app/pick-path-optimizer/) does both. Paste SKU locations (SKU, aisle, bay) and a day of orders. It groups the orders onto carts of the size you set and gives each cart a pick list in walking order, with the tote each item goes in. It also prices six ways of picking the same orders in feet, hours and wages. It runs in the browser and is MIT licensed.

## The exact route has been known since 1983

For a block of parallel aisles with a cross aisle at the front and one at the back, the shortest route through any set of shelf positions can be found exactly, and quickly. H. Donald Ratliff and Arnon Rosenthal showed how in 1983 ("Order-picking in a rectangular warehouse: a solvable case of the traveling salesman problem", *Operations Research* 31(3)). Walk the aisles left to right. At each aisle, keep only a few facts about the partial route: whether its front and back ends have been reached an odd or even number of times, and whether they are joined. An optimal route only ever does one of six things inside an aisle: pass through once, pass through twice, or go in from the front and/or the back and turn round, leaving one stretch unwalked. Between aisles it uses 0, 1 or 2 copies of each cross-aisle segment. That is a small dynamic programme, linear in the number of aisles.

It is the route warehouse textbooks describe and pickers rarely get. The common rules of thumb are S-shape (walk the full length of every aisle with a pick, alternating direction) and largest gap (walk the two outer aisles fully and serve every aisle in between from the back on the way out and the front on the way home, never walking its longest empty stretch). Both are easy to teach.

The tool's version is checked against Held-Karp, an exhaustive search over every visiting order, on 600 random small layouts. That covers back cross aisles and dead-end aisles, and docks in front of an aisle and between aisles. The two agree on every one, and the drawn walk is the same length as the computed one.

## How far the rules of thumb are from it

`ventures/pick-path-optimizer/bench.mjs` runs 1,000 random pick lists for each pick count. The layout is 10 aisles 10 ft apart with 20 four-foot bays, and picks fall uniformly on bays. This is invented data, so read the numbers as shape, not as a forecast for any warehouse. The cells are the mean extra walking over the exact route:

| Picks per trip | S-shape | Largest gap | Better of the two (worst case) |
|---:|---:|---:|---:|
| 2 | +12.2% | +12.2% | +12.2% (+178%) |
| 5 | +28.6% | +7.6% | +7.1% (+68%) |
| 10 | +34.3% | +6.7% | +6.6% (+35%) |
| 20 | +25.8% | +6.6% | +6.5% (+28%) |
| 40 | +9.7% | +11.1% | +7.4% (+26%) |
| 80 | +0.7% | +22.6% | +0.7% (+12%) |

The dock here is in front of aisle 1. Two things stand out. S-shape is worst around ten picks a trip, which is where many small carts sit. Once almost every aisle needs a visit, walking every aisle is close to optimal anyway, so S-shape is nearly exact at 80 picks. Largest gap is the reverse: good with few picks, poor with many. Neither rule is safe across the range. Even taking the better of the two for each pick list, some trips walk a quarter or more further than they need to.

With the dock in the middle of the front cross aisle instead, the gaps widen: the better of the two rules averages 15 to 17% over the exact route between 5 and 20 picks.

## Batching is the bigger lever

Routing alone saves a known, modest amount. Carrying several orders per trip is what changes the day. On the tool's example (160 SKUs with Zipf-shaped popularity, 120 orders of one to four lines, 10 aisles of 20 bays, all placeholders):

| How the orders are picked | Feet | Less walking |
|---|---:|---:|
| One order per trip, S-shape | 29,228 | baseline |
| One order per trip, shortest route | 25,284 | 13.5% |
| Carts of 4 in arrival order, shortest route | 12,004 | 58.9% |
| Carts of 4 grouped by the tool, shortest route | 8,580 | 70.6% |

Grouping matters as much as the cart: orders that need the same aisles share almost their whole walk. The tool fills carts seed-first. It starts with the order that has the longest walk alone, then adds whichever order adds least walking, scoring every candidate with the exact route. Then it moves and swaps single orders between carts while the total walk falls. That grouping is good, but not proven best. The exact part is the route for whatever cart you end up with.

At 200 ft a minute, the example's difference is about 1.7 picker-hours a day. That is only worth money if the hours go to other work, and the page says so.

## What it does not do

One block of aisles only: no middle cross aisles, one-way aisles or congestion. It ignores cart weight and volume, and the sorting at the pack station that batching adds. Ratliff and Rosenthal's method extends to two blocks (Roodbergen and de Koster, 2001), and that is the natural next step if anyone asks for it. Where SKUs should live in the first place is the [warehouse slotting optimizer](https://marisstella.app/warehouse-slotting-optimizer/)'s job; the two pages link to each other.

Source and tests: [`ventures/pick-path-optimizer`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/pick-path-optimizer).
