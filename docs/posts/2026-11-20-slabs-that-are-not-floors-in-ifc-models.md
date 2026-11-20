---
title: "Slabs that aren't floors: roofs, carpets and sun fins in IFC models"
seo_title: "IFC slabs that aren't floors: roofs, finishes, fins"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Of 600 IFC slabs typed FLOOR in 17 public models, 330 were finishes, sun fins or roofs. How our free takeoff now tells them apart for a Uniformat estimate."
---

In a building model, a slab is whatever the modeller drew with the floor tool.
Some of those are floors. Others are the flat roof, the carpet or tiles laid
on a floor (drawn as a second thin floor), the tiles on a stair, or the
horizontal fins of a sun shade. The IFC file exports all of them as
`IfcSlab` with PredefinedType FLOOR.

An elemental estimate prices these in different places. The roof deck goes
under B1020 Roof Construction. Carpet and tiles go under C3020 Floor Finishes.
Sun fins belong with the exterior enclosure. The free
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) groups
a model's bill of quantities by UNIFORMAT II, and until today it filed every
one of them under B1010 Floor Construction.

## How many there were

Across the 17 public models we test against, 600 slabs sat in B1010. We
listed every slab type name, then every slab that has no deck above the middle
of its plan. 330 of the 600 turned out to be something else:

- **251 floor finishes**: German Revit templates' `FB 15.0 - Teppich` (FB is
  Fußbodenbelag, floor covering), `Finish Floor - Ceramic Tile`, Dutch screeds
  (`dekvloer`), parquet, rugs;
- **25 stair finishes**: Norwegian `Flis - trapp`, tiles on a stair;
- **36 sun-shade fins**: `Sonnenschutz`;
- **18 roofs**: Dutch `plat dak` and `dakvloer` slabs, plus three structural
  decks that only the geometry gives away.

## Two readings

The first reading is the type name. A small word list, drawn from the names
these models actually use in English, German, Dutch and Norwegian, picks out
finishes, fins and roofs. A name that also names the structure stays a floor.
`Betongdekke 300 + avretting og flis` is a concrete deck that mentions its
screed and tiles, so it is still floor construction.

The second reading is for slabs whose name says nothing. Such a slab is the
roof when all of these hold:

- no other deck lies over it;
- walls or columns stop at its underside;
- no wall stands on it rising more than 1.5 m (a parapet is shorter; a
  storey's walls are not).

HHS Office's 3,537 m² `STB 30.0` deck on "Roof Level" passes. So does
FM_ARC_DigitalHub's 1,255 m² deck under its green roof. In one model the roof
is built from NURBS surfaces we don't read yet, so the roof's position is
unknown. There the rule does nothing: the unread roof might be the one over
the slab.

The frame rule we added earlier today reads the new codes. A column or beam
under a roof slab is roof construction, so 114 columns and 28 beams moved from
B1010 to B1020 with their decks.

## What it didn't change

Where a model's author set their own Uniformat code, the rules agree exactly
as often as before: 482 of 588 at level 3. No author in these 17 models codes a
slab, so the new rules were checked by reading every change, not against an
answer key. That full reading, including the slabs the rules left alone (a
garage slab on a storey named "Roof", a sloped deck that may be a terrace), is
in the venture's
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/slab-roles-2026-11-20.md).

The takeoff runs in your browser and nothing is uploaded. Its quantities are
estimates to check against the drawings, not a priced bill.
