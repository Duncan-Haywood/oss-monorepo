---
title: "When the export has no quantities: measuring Qto_ values from the model's own geometry"
seo_title: "Fill missing IFC Qto_ quantities from geometry"
date: 2026-11-21
tags: [ids-model-check, ifc-quantity-takeoff, ventures]
description: "Our free IDS checker can now write missing Qto_ volumes and areas measured from each element's body. On real exports 95% match stored values within 2%."
---

A client's IDS asks every wall for `Qto_WallBaseQuantities.NetSideArea` and
`NetVolume`. The architect exports from Revit with quantities turned off, and
the check fails on every wall. The fix usually means a round trip: change the
export settings, export again, check again.

The free [IDS checker and editor](https://marisstella.app/ids-model-check/)
could already write missing values into a copy of the `.ifc`: values the IDS
fixes, values a person types into a table, and quantities the element holds
under another set name (IFC2X3 exports keep them in `BaseQuantities`). A Revit
export with no quantity sets got nothing from that. Every `Qto_` request went
to the table for someone to type in.

Today it can measure them. Tick *Measure missing Qto_ volumes and areas* (or
add `--from-geometry` on the command line), and quantities no set holds are
measured from each element's body by the engine behind our
[IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/). That
covers gross and net volume for anything with a body, wall side and footprint
areas and width, slab and roof areas, and member cross-sections. Lengths and
heights are left out on purpose. A `Qto_` Length is a centre-line or nominal
figure, and the body alone does not say which.

## How close are the measured values?

Two of the HHS Office sample exports do store these quantities, so we checked
the measured values against them. Out of 3,858 stored values, **3,666 are
within 2%**. The takeoff's own cause finder traces 190 of the other 192 to the
stored figure, not the geometry:

- Revit's split-by-level walls carry the whole wall's area and volume on every
  piece.
- Some exporters store `GrossVolume` and `GrossSideArea` with the openings
  already taken out, which is the net figure.
- Revit writes half a mullion's surface area as its `CrossSectionArea`.

Two wall volumes are unexplained.

## Does it keep the fill's promises?

The fill still promises that every written value passes its check, that no
other line of the file changes, and that nothing which passed before fails
after. We ran it against four real exports and 69 IDS files. It measured and
wrote 3,048 values. Every one read back as passing in our checker and in
IfcTester, and IfcTester found no element that passed before and fails after.
On the Revit model (Schultz Residence), a cost-estimating IDS we wrote for the
test went from 225 failing elements to 4. Those 4 are walls whose geometry
gives no clean section, and the to-fill table says so.

A measured number is still a reading of the model, not the designer's figure.
The fill's summary counts how many values were measured rather than copied or typed. The figures, the scripts and what
is left (centre-line lengths, surface areas) are in the
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/qto-from-geometry-2026-11-21.md).
