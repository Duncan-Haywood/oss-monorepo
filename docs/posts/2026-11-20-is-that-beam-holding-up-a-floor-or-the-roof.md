---
title: "Is that beam holding up a floor or the roof? Reading it from IFC geometry"
seo_title: "IFC beams into Uniformat floor or roof construction, free"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff now sorts beams and columns into floor, roof or foundation structure by what sits on them: 1,168 placed on 17 public models."
---

An elemental estimate prices floor structure and roof structure as separate
lines: UNIFORMAT II's B1010 Floor Construction and B1020 Roof Construction.
An IFC model doesn't say which a beam belongs to. `IfcBeam` is `IfcBeam`
whether it carries the second floor or the rafters. Until today the free
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) parked
every beam, column and joist at "B10 Superstructure (not told further)" rather
than guess.

It now reads the answer from the geometry it already computes. For each
member it finds the slab or roof directly over the middle of the member, one
that comes down to within 0.6 m of its top. Under a roof means roof
construction. Under a floor means floor construction. A beam under a slab on
grade, or one sitting on a foundation storey and carrying the ground floor,
is a grade beam (A1010 Standard Foundations). Each element's CSV row names
the slab it found and the gap.

## What it did on 17 public models

- Elements coded to a full Uniformat element went from 19,767 to 22,546 of
  33,893.
- 1,168 frame members were placed: 832 floor construction, 263 roof
  construction, 73 grade beams. 3,128 stay at B10, 2,191 of them in one steel
  model with no slabs or roof modelled, so there is nothing for them to carry.
- Where the models' authors set their own Uniformat code (588 elements), the
  match rate is unchanged: 482 at level 3.

On a four-storey office (S_Office), the 59 beams and columns on each of the
first three storeys read floor construction and the 59 on the top storey read
roof construction. On a Dutch house (schependomlaan), 73 of the 82 beams on the
"-1 fundering" storey came out as grade beams.

Two easy cases came along with it. 1,685 curtain-wall panels exported without
their curtain wall now go to exterior walls, as their mullions already did.
33 stair stringers now go to stair construction.

## The rule we threw out

The obvious shortcut is the storey name: anything on a storey called "Roof"
(or "Dach", or "dak") is roof structure. We tried it. On the only model whose
author coded frame members, it put 4 struts standing *on* "Roof Level" into
roof construction, and the author had them in floor construction. Revit files
an element under the level it starts from. So a storey name tells you where a
member starts, not what it holds up. The rule isn't used.

## What it still gets wrong

That same Dutch house models its flat roofs as slabs typed FLOOR ("plat dak").
So the slab, and the 19 beams under it, read as floor construction. Plan cover
also comes from bounding boxes, so a member under the empty corner of an
L-shaped slab can be given that slab. The full method and counts are in the
venture's
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/frames-2026-11-20.md).

The quantities are only as good as the model, and the grouping is a starting
point for an estimator to check, not a cost plan.
