---
title: "A barn roof on a 10x10 shed: 19% more room for the same money"
date: 2026-10-30
tags: [shed-designer, framing, structure, storage]
description: "A gambrel roof, framed as gusseted trusses and checked as three-hinged frames, encloses 900 cu ft on a 10x10 for $3,228; a 6/12 gable, 756 for $3,216."
---

A gambrel roof (the barn shape) has two slopes a side: a steep lower one and a shallow upper one, meeting at a knee. Barns use it because it puts the roof's volume where you can use it. The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) now frames one: every board is at its real size, the joints are checked, and it gets a structure check and a price like the gable.

**How it is framed.** A truss at each rafter position: four chords cut from the rafter stock, plywood gussets (15/32") on both faces at the knees and the peak, and a tie on the wall plates beside the lower chords. Each lower chord's foot is cut level and sits on the plate. A birdsmouth at a 20/12 pitch would cut most of the board away. There is no ridge board. The gable-end trusses stand on the gable walls, and the gable studs carry them. Every chord is short: on a 10x10 the lower chord is 58-5/16" and the upper 33-9/16", so the trusses come out of 8 ft boards.

**How it is checked.** Each truss is a three-hinged frame: pinned at the heels, with the tie between them, a hinge at the peak, and knees made rigid by the gussets. That frame is statically determinate, so its thrust and knee moment come from statics alone. A test holds the solver to the closed form within 0.2%. The checks are:

- the chords, for bending with compression (NDS 3.9.2);
- the tie, for tension;
- the gusset nails, for the knee moment, by the elastic method, at 61 lb an 8d common through 15/32" plywood (the NDS yield-limit equations);
- the heel nails, for the thrust;
- the seat, for bearing.

Snow on one side only is checked as well as snow on both. The plywood gussets' own strength, wind and uplift are not checked yet; the Structure tab says so.

**What it buys.** These are the default 10x10 designs from the engine, with 86-1/2" walls and the starting Home Depot prices (seen 2026-10-29), before tax:

| Roof | Peak | Price | Clear space | Above the walls |
| --- | --- | --- | --- | --- |
| Gable 6/12, ridge board | 11.4 ft | $3,216 | 756 cu ft | 117 cu ft |
| Gable 12/12, ridge board | 14.0 ft | $3,432 | 874 cu ft | 235 cu ft |
| Gambrel 20/12 + 6/12, 2x6 chords | 13.8 ft | $3,228 | 900 cu ft | 261 cu ft |
| Gambrel, 2x4 chords | 13.8 ft | $3,179 | 922 cu ft | 283 cu ft |
| Gambrel, 2x6 chords, loft over all of it | 13.8 ft | $3,459 | 900 cu ft | 261 cu ft, plus 78 sq ft of loft floor |

For $12 more than the 6/12 gable, the gambrel encloses 19% more space and more than twice as much above the walls. Against a 12/12 gable of about the same height, it holds more and costs $204 less.

**It is overbuilt, as the builder said.** With 2x6 chords at 24", under 30 psf of snow:

- the lower chords check at 13% and the upper at 15%;
- each truss pushes out 211 lb, so a 2x4 tie is at 5% of its tension capacity;
- the heel nails govern at 51%: three 16d commons a side.

The 2x4 version is $49 cheaper and its chords still check at 30%. Its knee gussets then govern at 72%. It also adds 22 cu ft, because the underside of a 2x4 chord is 2" closer to the roof.

**The loft.** A loft turns the ties into loft joists (2x6 at 24"), sized for 20 psf of stored things (IRC Table R301.5, attics with limited storage), not for people. On the 10x10, 44 of its 78 sq ft have 3 ft or more of clear height above them.

Next: the plan sheets and build steps for the gambrel, the option in the page, and gambrel designs in the gallery of ready-made sheds. The numbers here come from `gambrel.mjs` and `storage.mjs` in the venture, and `gambrel.test.mjs` pins the claims. This is a screening tool, not an engineer's design.
