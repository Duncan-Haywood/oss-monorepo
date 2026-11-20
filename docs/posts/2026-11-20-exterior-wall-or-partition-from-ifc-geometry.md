---
title: "Exterior wall or partition? Asking the geometry when the IFC flag lies"
date: 2026-11-20
seo_title: "Exterior wall or partition? Ask the IFC geometry"
tags: [ifc-quantity-takeoff, ventures, construction]
description: "Our IFC takeoff now sorts walls into exterior walls or partitions by casting rays from each face. On 17 public models the IsExternal flag was often wrong."
---

Exterior walls and partitions are priced very differently, and in an
elemental estimate they sit in different elements: B2010 Exterior Walls and
C1010 Partitions in UNIFORMAT II. When the
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) learned
to group a bill of quantities by Uniformat element earlier today, it relied on
the flag an IFC model can carry on each wall, `IsExternal`. Three of the 17
public models we test on don't set it, so their 274 walls went to "no
Uniformat element".

So the tool now asks the building itself. Each wall is read in plan as a
rectangle. From nine points along each face, five rays go out: straight, and
30 and 60 degrees to either side. If a ray crosses no other wall, curtain wall
or glazing panel at that height, it has left the building. A wall with one
face open at five or more of its nine points is exterior. Doors and windows
don't let rays through, so a partition seen through a doorway still counts as
inside. On the two models with no flags that we checked plan by plan (a small
German house and an institute building on five levels), every placement is one I'd make,
apart from two stair-core walls in the attic that could go either way.

## The flags were often wrong

The more interesting result came from comparing the geometry with the flags
authors did set. On 4,564 flagged walls the two agree on 3,534. Then we drew
the plans of the 1,030 disagreements:

- Two models (they look like versions of the same office building) flag
  **every** wall exterior, the toilet partitions included. One house model flags 134 gypsum-board room
  partitions exterior. Another model flags its 67 stair and lift shaft walls
  exterior, in the middle of the floor.
- One residence flags 13 walls whose type is literally `Ext. Wall Siding` as
  interior.
- Going the other way, the geometry reads linings as exterior. Revit's
  `Interior - Furring` stud wall on the inside face of an exterior wall is
  modelled as a separate wall, and the test sees through it on purpose, so
  that the inner leaf of a cavity wall reads with its brick skin. Whether a
  lining is priced with the exterior wall or with the partitions is a
  method-of-measurement call, so the row says "inner leaf or lining" and
  leaves the call to you.
- One model has no facade walls at all (its envelope is built from generic
  proxies), so its partitions look exterior.

A third witness is the wall type's own name, where it says exterior or
interior. It sided with the geometry 228 times and with the flag 213 times.
Neither source is reliable on its own, so the rule is conservative:

1. **No flag:** the geometry decides, and doors in that wall follow it.
2. **The same flag on every wall** (ten or more walls), with the geometry
   reading at least a fifth of them the other way: the flag carries no
   information and is set aside.
3. **Any other flag is kept.** Where the geometry disagrees, the element's
   row in the CSV says "the geometry reads it inside the building, check it".

That last one is the useful part for an estimator. Instead of trusting a flag
nobody looks at, they get a short list of walls to check before the B2010 line
gets priced.

## The numbers

Across the 17 models, elements with no Uniformat element dropped from 5,219
to 4,951, and level-3 codes went from 19,417 to 19,767. The 588
author-assigned Uniformat codes we compare against still match as before (482
at level 3); none of them are on walls. The full table, the plans we looked
at and the cases where the geometry is wrong (knee walls under a roof, a
facade not modelled as walls) are in
[eval/envelope-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/envelope-2026-11-20.md).
`node eval/envelope-check.mjs model.ifc --svg plans/` draws the same plans for
your own model.

Nobody who prices buildings has checked these placements yet. If you do, we'd
like to hear which way you put a furring wall.
