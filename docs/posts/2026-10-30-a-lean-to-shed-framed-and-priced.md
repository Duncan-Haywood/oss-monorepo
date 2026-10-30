---
title: "A lean-to shed, framed and priced: $165 less than the gable"
date: 2026-10-30
tags: [shed-designer, framing, structure, cost]
description: "The shed designer now frames a single-slope lean-to. At 8x12 it is $165 under the default gable for the same walled volume, with 10 ft rafters."
---

Until today every design in the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) was a gable: two slopes meeting at a ridge. A lean-to has one slope, running from a tall front wall down to a low back wall. That suits a shed against a fence or the side of a house, and it is often the cheapest roof per square foot. The framing engine now builds one in full, with the same checks the gable gets.

**How it is framed.**

- The back wall is the wall height you set. The front wall is taller by the rafter's rise between its two seats: (width − wall depth) × pitch. At 8 ft wide and 4/12 with 2x4 walls, that is 30-13/16".
- Each rafter is one board running from tail to tail. It bears on both walls, with a birdsmouth on each one (the front one's heel faces in), or on a variable-pitch connector.
- There is no ridge, no ridge beam and no rafter ties. A rafter resting on two walls pushes neither wall outward.
- The end walls are framed square at the back wall's height. Raked studs above them are cut to the roof line, the same way a gable end is built. Their plates stop against the inside face of the tall front wall.

**What the checks say.** The connection check now tests that every rafter seats on both walls' cap plates. Nothing floats and nothing clashes across 48 combinations of seat, overhang, stud size and footprint. A seeded sweep of 400 random lean-to designs passed every invariant the gable's fuzz test asks for: finite geometry and prices, well-formed SVG and DXF, and build steps with no NaN.

The rafter works harder. It spans the full 89" between the walls instead of half the building, so a 2x6 at 24" with 30 psf snow sits at 72% of its NDS allowable, against 18% on the gable. The studs in the tall front wall are checked at their real length.

**What it costs.** These are the tool's own estimates at the dated Home Depot prices it ships with, before sales tax.

| Design | Total | Lumber | Foundation and hardware | Walled volume |
|---|---|---|---|---|
| Default 8x12 gable (ridge beam) | $3,026.46 | $737 | $238 | 692 cu ft |
| 8x12 lean-to, 6 ft back wall, 4/12 | $2,861.61 | $651 | $134 | 699 cu ft |

The lean-to is $165 cheaper (5.4%) for slightly more walled volume. Most of the saving is the ridge beam, its posts and hangers, and the extra skid and blocks that put a skid under each post. The siding costs $23 more because the front wall is taller.

Its rafters are 119-15/16" long, so they come out of 10 ft boards, and nothing in the frame needs a board over 12 ft.

**What is not done yet.** The lean-to can be built from the engine (`STYLE_PRESETS` in `model.mjs`), but it is not in the "New design" menu yet. The plan sheets still draw the building section, rafter detail and elevations as a gable. The next change draws those, the 3D labels and the build steps, then puts the lean-to in the menu and in the gallery of starting designs.

As always, this is a screening check, not an engineer's review, and nothing here is code-checked for your site.
