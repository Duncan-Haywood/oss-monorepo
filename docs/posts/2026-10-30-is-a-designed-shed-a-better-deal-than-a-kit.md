---
title: "Is a shed you design yourself a better deal than a kit? About even, with taller walls"
date: 2026-10-30
tags: [shed-designer, cost, storage, prefab]
description: "Against 17 Home Depot and Lowe's shed listings, a designed 8x12 matches a kit on floor area per dollar and beats most on wall volume."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) prices a shed board by board. Its 8x12 starting design is $3,026 in materials before tax. That figure raises two questions:

- Is that design the best one at its size?
- Would buying a kit be better value?

We checked both.

## Is the default the best design at its size?

We wrote an audit (`paretoaudit.mjs`) that has no code in common with the designer's own design search. It shares only the framing model, the estimate and the structural checks. For each starting design, it does two things:

- **Brute force over a coarse grid.** It tries:
  - nine footprints up to 100 sq ft;
  - three wall heights;
  - four roof pitches;
  - rafter and stud spacing;
  - 2x4 or 2x6 rafters and floor joists;
  - two kinds of block foundation.

  That is about 3,500 designs per starting point. Each one is framed, priced and run through every structural check.
- **Random restarts.** Starting from random points, it moves one setting at a time on a finer grid (6" sizes, 2" walls, 3/12 to 8/12) for as long as the move saves money without losing storage.

Storage is measured, not scored by eye. It is the inside floor area times the clear height under the top plates, plus half the volume of the roof triangle.

A rival only counts if it looks like the starting design:

- the same siding, roof covering and roof type;
- a pitch within one step of the start's;
- no lower walls and no shorter eaves;
- every check passing, with no warning.

| Starting design | Materials | Storage | Cheapest look-alike holding as much | Gap |
|---|---|---|---|---|
| 8x12 (ridge beam, 7'2" walls) | $3,026 | 615 cu ft | $2,954: 2x4 rafters and 2x4 floor joists | 2.4% |
| 8x12 classic (8 ft walls) | $3,251 | 695 cu ft | $3,236: 2x4 floor joists, blocks | 0.5% |
| 8x10 | $3,017 | 574 cu ft | $3,009: 2x4 floor joists, blocks | 0.3% |

Every preset is within 2.5% of the cheapest design that looks the same and stores as much. Nearly all of each gap comes from the floor. On skids 4 ft apart, a 2x4 floor joist at 16" passes the floor check, and it is what the Little Cottage kits below use. The structural right-sizing work already under way will close that.

The audit found one real fault. The 8x8 garden-shed preset had a birdsmouth cut deeper than a third of its 2x6 rafter at 8/12, which the designer itself warns about. It is now 6/12. That saves $144 and costs 2% of its storage.

The quick version of the audit runs in about a second with the rest of the tests. It changes each setting of every preset one at a time, and fails if any preset drifts more than 3% from its best neighbour. So a price change or a framing rule cannot quietly make a starting design a bad buy. `AUDIT_FULL=1` runs the full brute force.

## Is it a better deal than a kit?

We collected 17 wood shed listings at or under 100 sq ft from Home Depot and Lowe's:

- 13 DIY kits and 4 installed sheds;
- brands: Little Cottage Co., Handy Home, Best Barns, Heartland and Tuff Shed.

Both stores block automated reads. Every price is therefore a search engine's copy of the listing, seen on 2026-10-30. Some of those copies may be months old. Each one is linked in `value.mjs` for anyone to check.

Two things make a kit's price and a designed shed's materials hard to compare.

- **Kits leave things out.** None of the DIY kits includes shingles, and several leave out the floor. We added the designer's own price for roofing (shingles, underlayment, drip edge) and paint to each kit, scaled by floor area. That is about $630 on an 8x12.
- **Kit walls are lower.** Where a third-party page gave the sidewall, it was 6'0" to 6'4". The designer's default is 7'2".

8x12 and 10x10, materials only, before tax:

| Shed | Price | With the roofing and paint it leaves out | Sq ft per $1,000 | Floor x wall height, cu ft per $1,000 |
|---|---|---|---|---|
| Shed designer 8x12 default (floor, blocks, door, two windows) | $3,026 | — | 31.7 | 229 |
| Best Barns Salt Box 8x12 kit, no floor | $2,100 | $2,707 | 35.5 | — |
| Best Barns Haven Mini 8x12 kit (6'4" walls) | $2,160 | $2,767 | 34.7 | 220 |
| Handy Home Meridian 8x12 kit with floor (6'4" walls) | $2,510 | $3,117 | 30.8 | 195 |
| Little Cottage Value Gambrel 10x10 with floor (6' walls) | $2,306 | $2,938 | 34.0 | 204 |
| Little Cottage Value Gable 10x10 with floor | $2,339 | $2,971 | 33.7 | — |
| Heartland Statesman 10x10, installed | $4,193 | (included) | 23.8 | — |
| Tuff Shed Tahoe Sierra 8x10, installed (6' walls) | $3,299 | (included) | 24.2 | 145 |

What the numbers say:

- **On floor area per dollar, the designed shed is about even with a kit, not better.** The cheapest 8x12 kits come out 10% to 12% ahead once their roofing is added, and one of them has no floor.
- **On wall volume per dollar, the designed shed wins by 4% to 17%,** because its walls are about a foot taller. Tall walls are what shelving uses.
- **The four installed sheds cost 10% to 55% more per square foot than the designed one.** The Lowe's installed prices include delivery, permits where needed and some levelling. Those are real costs a DIY builder pays in time.
- **Nothing here meets a $2,000 budget with a roof on it.** The cheapest kit, Heartland's 8x8 on sale at $1,189 with no floor, is about $1,600 once its roofing and paint are added. For a $2,000 shed, the design has to get smaller or simpler, which is what the designer's design search and "fit my budget" are for.

The designer now shows this on the summary panel:

- the design's square feet and cubic feet per $1,000;
- the three kits nearest its size, each with its listing link;
- each kit's figure with the left-out roofing added.

Labour is not in either side. Your own hours are not free, and the designer estimates them separately.

*Store prices are search-result copies seen on 2026-10-30, not live reads. Check each link before you rely on them. Shed Designer is not engineered or code-checked.*
