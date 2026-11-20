---
title: "Slab on grade, gutters and balcony rails: three more fixes to an IFC Uniformat estimate"
seo_title: "IFC slab on grade, gutters and railings in Uniformat"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "164 elements in 17 public IFC models were filed in the wrong Uniformat element or none. How our free takeoff now finds slabs on grade, gutters and outer rails."
---

The free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
can group a building model's bill of quantities by UNIFORMAT II, the elemental
breakdown most US cost plans use. An element filed under the wrong code is
priced in the wrong place, and an element with no code isn't priced at all.
Earlier today we sorted out
[slabs that aren't floors](2026-11-20-slabs-that-are-not-floors-in-ifc-models.md).
This round covers three groups that were still misfiled.

## Ground slabs filed as floors

A concrete slab poured on the ground goes under A1030 Slab on Grade, in the
substructure. Until now the tool filed a slab there only when the model typed
it BASESLAB or put it on a storey below grade. A ground floor in a building
with no basement went under B1010 Floor Construction with the suspended
floors.

The name catches some of them: duplex's "127mm Slab on Grade", a German
"Bodenplatte", a Dutch "grondplaat". For a slab whose name says nothing, we
check the geometry. The slab has to start within 0.5 m of the lowest slab or
wall in the model, with nothing under it and no beam or column holding it up.
Walls don't count against it, because a house's slab on grade often sits on
its stem walls. Beams do: schependomlaan's hollow-core ground floor rests on
72 foundation beams over a crawl space. It is a suspended floor, and it stays
in B1010.

A slab on grade with no floor or roof over it is a patio or a walk. That goes
to G2030 Pedestrian Paving, as do duplex's two "Exterior Slab on Grade"
pieces.

## Gutters and downpipes filed as plumbing

NISTIR 6389 files gutters and downspouts under B3010 Roof Coverings. The
tool had them as generic pipework, coded only to level 1 ("D, services")
because it can't tell which system a pipe belongs to. They now go to B3010
when the PredefinedType is GUTTER (ARK_NUS's three "Takrenne") or the name
says gutter or downpipe. schependomlaan's 60 zinc pipes are named "hwa
afvoer", Dutch shorthand for rainwater downpipe. The 12 slabs that frame its
box gutters ("gootconstructie") go to B3010 with them.

## Railings with no code

A railing that isn't part of a stair had no code, since a balcony guard and a
loose stair rail look the same in IFC. Where the model flags a railing
IsExternal, it is now filed as a balcony wall and handrail under B2010
Exterior Walls. That covers 77 railings in schependomlaan. The flag false is
still ignored, because Revit writes false on every railing it exports (all
253 in one house).

## The numbers

Across the 17 public models we test against, 164 element codes changed in
6 models:

| change | elements |
|---|---|
| to A1030 Slab on Grade | 10 (including the 3,518 m² ground slab of HHS Office, in two of its models) |
| to G2030 Pedestrian Paving | 2 |
| to B3010 Roof Coverings | 75 (gutters, downpipes, gutter framing) |
| to B2010 Exterior Walls | 77 railings |

Where authors coded elements themselves (588 elements), the tool agrees with
them exactly as often as before. None of those authors coded a ground slab, a
gutter or a railing, though, so these rules have nothing to be checked
against yet. The least certain call is HouseZ. Its slabs carry no names, and
we can't tell from the geometry whether its main 205 m² slab sits on the
ground or over a crawl space. It stays B1010.

One correction to our own notes. We had written "parapets as B3010" as a to-do.
ASTM E1557 puts parapets with the exterior wall (B2012, under B2010), so a
parapet modelled as a wall is already in the right place.

The method, every changed element and what's left are in the venture's
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/slab-on-grade-2026-11-20.md).
Next up are railings placed by what they stand on, and downpipes sorted into
outside (B3010) or inside (D2040 Rain Water Drainage).

*The takeoff gives estimates from the model's geometry and names. It is not
professional quantity surveying advice; check quantities against the drawings
and your contract's method of measurement.*
