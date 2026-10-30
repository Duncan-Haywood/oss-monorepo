---
title: "Four ground anchors for a shed, and why sliding is the harder job"
date: 2026-10-30
tags: [shed-designer, wind, structure, anchors]
description: "Every shed preset tips at 6 to 7 psf of wind on its own. Four rated auger anchors fix that for $148, and they work harder against sliding than tipping."
---

A small wooden shed is lighter than it looks. The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) weighs each design from its drawn framing and sheet goods, counted low on purpose. It then checks how the wind would tip it, using the allowable-stress combination 0.6D + 0.6W: wind on the whole face and lifting the roof, against 0.6 of the weight. Every preset tips at 6 to 7 psf. The tool's default design wind is 20 psf. Until today it said so in a sentence under the Structure table and left anchoring to you. Now the anchors are part of the design, priced, and checked as a pass/fail row.

**The part.** Tie Down Engineering's double-head auger anchor kits are sold at Home Depot. Each kit has four anchors, four 8 ft steel straps and the slotted bolts that tension them. The maker's instruction sheet (08465, revised May 2024) says every kit is "tested to 4725 lbs. for 3150 lbs. working load with 1.5 safety factor". That rating is only as good as the soil, and the sheet lists a class for each length:

- the **48" kit (59802)** is rated for class 4a: loose to medium-dense sand, firm to stiff clay. It is $145.84 at Home Depot (read from a search result on 2026-10-30), and it is the new default.
- the **30" kit (59800)** is rated for class 2: very dense sand, coarse gravel, cobbles. It is $109.35, an option if a soil probe says your ground is that firm.

Softer ground than class 4a is outside both ratings. The build step says so, and says to call 811 before screwing a 4 ft rod into the yard.

**The sums.** Each strap wraps the outer skid at a corner, the way the maker's sheet wraps a beam. It then runs down at 45 degrees to an anchor set out along the corner's diagonal, so one strap holds the shed both down and sideways. For wind from each direction, the two windward corners carry:

- the **hold-down** the tipping check already worked out: 370 to 780 lb on the presets;
- **half the wind's sideways push**, 0.6 x 20 psf on the whole face. Friction under the blocks is not counted, because the same wind lifting the roof takes weight off them.

The strap's pull is whichever of the two needs more. The surprise is that sliding wins on every preset, not tipping. On the default 8x12 the sideways share is 693 lb a corner against 501 lb of hold-down. With the strap's plan line 45 degrees off the wind, that sideways share needs a pull of 1,386 lb, which is 44% of the 3,150 lb rating. Across the presets the row reads 31% (the 8x8 lean-to) to 72% (the 12x16).

**The rest of the load path.** An anchor that holds a skid down does nothing if the floor lifts off the skid. So the floor frame is tied to the outer skid at each corner with Simpson H2.5A ties (615 lb each in Simpson's catalog), one or two a corner depending on the hold-down. The walls' hold to the floor is not checked yet. It runs through the siding nailed over the rim joist, and the README says that plainly.

**What it costs.** $148.16 on the default 8x12 (the kit and four ties), and about two hours on the labour estimate. That makes the default shed more expensive, and it is the first time this lane has done that on purpose: a shed that slides off its blocks in a 20 psf wind is not a cheaper shed. If you anchor some other way, set anchors to "none". The Structure tab will then show the shed tipping, with the wind speed it tips at.

This is a screening check from a maker's published rating, not an engineer's design. The plans still say they are not engineered or code-checked.
