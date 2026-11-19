---
title: "558 mullion cross-sections that were really face areas: checking IFC areas against the geometry"
seo_title: "Checking stored IFC areas against the model's geometry"
date: 2026-11-19
tags: [ifc-quantity-takeoff, ventures]
description: "We cut 7,883 stored areas from the geometry of 8 public IFC models. 6,509 agreed; for 1,100 of the rest the cause has a name, and 607 stored figures were wrong."
---

The [last post](2026-11-19-ifc-stored-quantities-disagree-with-geometry.md) checked the volumes
an IFC model stores against the volumes its geometry gives: one in eight
disagreed. Most trades don't price volumes, though. Plaster, paint,
formwork, cladding and screed are priced by the square metre. So
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) now cuts
areas from the geometry as well, and checks those too.

## An area is a section

The IFC quantity sets say what each area means, and almost every one of them
is a plane cut through the body:

- a wall's **side area** is "as viewed by an elevation view of the middle
  plane of the wall", so the section on that plane;
- its **footprint** is the plan, which we cut at the wall's base, where doors
  cut it and windows don't;
- a slab's **area** is "the area of the extruded area geometry", so the
  profile, the section normal to the extrusion;
- a member's **cross-section** is the profile, cut at mid-length.

The takeoff already turns every solid into a signed sum of convex pieces to
get exact volumes. A plane cuts each convex piece into a convex polygon, and
the signed polygons add up exactly as the signed pieces do. So the areas come
out exact in the same way: the gable wall in the sample model is a 10 m²
trapezoid, its door takes 2.1 m² out of the side and 0.2 m² out of the
footprint, and an IPE 200's section comes out at the steel tables' 28.48 cm².

## Eight public models

On the same eight public models (Revit, ArchiCAD, Tekla and others),
**6,509 of 7,883 stored areas agree** with the section, to rounding. All
1,667 wall footprints agree. the 1,392 member cross-sections in the Revit office model agree, and so
do the 260 schependomlaan slab areas.

The 1,374 that don't are more interesting, because most of them have a cause
you can name:

| Cause | Pairs | What happened |
|---|---:|---|
| Grows with length | 558 | a Revit mullion type stores "CrossSectionArea" = its length x 2.97 m; the section is 0.0104 m² |
| Net written as gross | 325 | the openings were already taken out of GrossSideArea |
| Doors left in | 82 | NetFootprintArea equals the gross |
| Measured on a face | 55 | the side area of one face, not the middle plane; at a corner the two differ |
| Agrees with a wrong volume | 31 | the stored area and volume describe another wall than the geometry |
| Wrong unit | 25 | 23 roof slabs whose area is the geometry divided by 10.7639, the m²-to-ft² factor |
| Split by level | 24 | each piece of a wall carries the whole wall's area |
| No cause found | 274 | listed in the write-up |

The mullions are the one to remember. Multiply a "cross-section" of 6.8 m² by
a 2.3 m length and you get 15.7 m³ of aluminium for one mullion. The geometry
says 0.024 m³. Nobody would believe that number, but nobody would see it
either, buried in a sum over 558 mullions.

The square-foot factor also cleared up three volumes the volume check had
left unexplained. kleine_Wohnung's roof slabs store GrossArea 5.5632 against
a NetArea of 59.8815, and their GrossVolume is short by the same 10.7639.
Somebody converted square metres to square feet the wrong way round, and
only for the "gross" figures.

In 607 of the disagreements the stored figure is the wrong one, and the bill
of quantities uses the area cut from the geometry. Where a wall or slab stores
no area at all, it does the same.

## What it doesn't do

Faceted bodies (triangle meshes) aren't cut yet: 2,051 elements in these
models are meshes that store one of these quantities, and they keep their
stored area. Cutting a closed mesh by a plane is the next step. The planes are
our reading of the IFC definitions. A tool that reads "footprint" another way
shows up as a disagreement, with the cause named when it's one we know. And
eight models is a small sample.

The method, the raw output and every number are in
[eval/areas-vs-stored-2026-11-19.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/areas-vs-stored-2026-11-19.md).
The tool is free and MIT licensed, and your model never leaves the browser
tab.
