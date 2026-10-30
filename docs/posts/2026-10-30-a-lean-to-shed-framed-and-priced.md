---
title: "A lean-to shed, framed and priced: $173 under the default gable"
date: 2026-10-30
tags: [shed-designer, framing, structure, cost]
description: "The shed designer now frames a single-slope lean-to. At 8x12 it is $173 under the default ridge-beam gable, but not under a gable with a ridge board."
---

Until today every design in the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) was a gable: two slopes meeting at a ridge. A lean-to has one slope, running from a tall front wall down to a low back wall. That suits a shed against a fence or the side of a house. The new Shape box switches between the two, and "8x12 lean-to" is in the New design menu. The lean-to gets the same plan sheets, 3D view, build steps, cut sheet and checks as the gable.

**How it is framed.**

- The back wall is the wall height you set. The front wall is taller by the rafter's rise between its two seats: (width − wall depth) × pitch. At 8 ft wide and 4/12 with 2x4 walls, that is 30-13/16".
- Each rafter is one board running from tail to tail. It bears on both walls, with a birdsmouth on each one (the front one's heel faces in), or on a variable-pitch connector.
- There is no ridge, no ridge beam and no rafter ties. A rafter resting on two walls pushes neither wall outward.
- The end walls are framed square at the back wall's height. Raked studs above them are cut to the roof line, the same way a gable end is built. Their plates stop against the inside face of the tall front wall.
- There are no gable vents. Both soffits are vented, so air comes in at the low eave and out at the high one.

**What the checks say.**

- The connection check now tests that every rafter seats on both walls' cap plates.
- Nothing floats and nothing clashes across 48 combinations of seat, overhang, stud size and footprint.
- A seeded sweep of 400 random lean-to designs passed every invariant the gable's fuzz test asks for: finite geometry and prices, well-formed SVG and DXF, and build steps with no NaN.
- The rafter works harder. It spans the full 89" between the walls instead of half the building, so a 2x6 at 24" under 30 psf snow sits at 72% of its NDS allowable, against 18% on the gable.
- The studs in the tall front wall are checked at their real length.

**What it costs.** These are the tool's own estimates at the dated Home Depot prices it ships with, before sales tax, with the tool's default limit of boards you can haul at 12 ft.

| Design | Total | Lumber | Foundation and hardware |
|---|---|---|---|
| Default 8x12 gable (ridge beam, gable vents) | $3,074.14 | $744 | $238 |
| 8x12 lean-to, 6 ft back wall, 4/12 | $2,900.90 | $700 | $122 |

The lean-to is $173 cheaper (5.6%) for about the same walled volume: 699 cu ft of walls and roof wedge against 692. The saving is:

- the ridge beam (two 12 ft 2x10s and their spare, $76);
- the four louvered gable vents ($92);
- the 14 rafter hangers ($25);
- the extra skid and blocks that put a skid under each beam post.

Its siding costs $23 more, because the front wall is taller. Its rafters come out of 10 ft boards, and so do the tall wall's 98-3/8" studs, so nothing in it is longer than 12 ft.

One thing to correct while writing this up. The first build of the lean-to still priced rafter hangers, because its saved roof type was the default "ridge beam". It now prices none.

**Where it lands in the design search.** The design search (`designsearch.mjs`) now tries lean-tos too, with two new layouts that keep every opening in the tall front wall. Once every design on the front has been explored, it spends what is left of its budget refining the best lean-tos.

We ran a 2,000-design search under 100 sq ft. Of the 68 designs on the Pareto front of cost, storage and looks, 37 are lean-tos. Two of the search's four picks are lean-tos:

- **Most storage:** a 10x10 lean-to, 797 cu ft, at $2,885.05.
- **Best looks:** an 8x10 lean-to with a door between two windows in the tall wall, at $2,651.00.

**Against a cheaper gable it does not win on cost.** The cheapest design on the front is still a gable: an 8x10 with a ridge board and rafter ties, at $2,267.88. The cheapest lean-to on the front is $2,611.51. So a lean-to beats the beam-and-post gable, not the gable with ties.

The looks score is a heuristic we wrote: full marks for a single slope between 3/12 and 5/12, and for a gable between 6/12 and 9/12. Read it as a rule of thumb, not a verdict.

As always, this is a screening check, not an engineer's review, and nothing here is code-checked for your site.
