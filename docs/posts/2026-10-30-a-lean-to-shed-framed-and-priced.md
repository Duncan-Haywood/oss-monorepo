---
title: "A lean-to shed, framed and priced: $182 under the default gable"
date: 2026-10-30
tags: [shed-designer, framing, structure, cost]
description: "The shed designer now frames a single-slope lean-to. At 8x12 it is $182 under the default ridge-beam gable, but not under a gable with a ridge board."
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

**What it costs.** These are the tool's own estimates at the dated Home Depot prices it ships with, before sales tax.

| Design | Total | Total with boards no longer than 12 ft |
|---|---|---|
| Default 8x12 gable (ridge beam, gable vents) | $3,026.46 | $3,074.14 |
| 8x12 lean-to, 6 ft back wall, 4/12 | $2,844.34 | $2,893.52 |

The lean-to is $182 cheaper (6.0%) for about the same walled volume: 699 cu ft of walls and roof wedge against 692. The saving is the ridge beam, the four louvered gable vents ($92), the 14 rafter hangers ($25), and the extra skid and blocks that put a skid under each beam post. Its siding costs $23 more, because the front wall is taller.

Its rafters come out of 10 ft boards. With the default board list, though, the cut sheet buys 14 ft 2x4s. The tall wall's studs are 98-3/8", too long for an 8 ft board. A 14 footer takes one of them plus a 67-1/2" stud from a low wall, or two low-wall studs and a door rail. Limiting the boards to 12 ft costs $49 more, about what it costs the gable.

One thing to correct while writing this up. The first build of the lean-to still priced rafter hangers, because its saved roof type was the default "ridge beam". It now prices none.

**Against a cheaper gable it does not win on cost.** The design search (`designsearch.mjs`) now tries lean-tos too, with two new layouts that keep every opening in the tall front wall. In a 2,000-design search under 100 sq ft, three lean-tos reach the Pareto front of cost, storage and looks.

The cheapest of them is an 8x10 at $2,599.27: one door, 6'6" back wall, metal roof. The cheapest gable on the front is an 8x10 with a ridge board and rafter ties at $2,517.43, which is $82 less. So the lean-to beats the beam-and-post gable, not the gable with ties.

The search's "best looks" pick is a lean-to with a door between two windows in the tall wall. Its looks score is a heuristic we wrote: full marks for a single slope between 3/12 and 5/12. Read it as a rule of thumb, not a verdict.

As always, this is a screening check, not an engineer's review, and nothing here is code-checked for your site.
