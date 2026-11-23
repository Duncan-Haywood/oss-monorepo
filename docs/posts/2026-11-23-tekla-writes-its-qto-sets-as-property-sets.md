---
title: "Tekla writes its Qto_ quantity sets as property sets, and fills used to skip them"
seo_title: "Filling Tekla's Qto_ property sets from IFC geometry"
date: 2026-11-23
tags: [ids-model-check, ventures, bim, tekla]
description: "Tekla Structures stores every Qto_ set as an IfcPropertySet. IDS Model Check's fill now measures values for those sets too, within 2% on 551 of 583."
---

IFC has two kinds of containers for an element's numbers. Properties
(fire rating, load bearing) go in an `IfcPropertySet`. Quantities (length,
area, volume) go in an `IfcElementQuantity`, and the standard ones have
names that start with `Qto_`: `Qto_WallBaseQuantities`,
`Qto_ColumnBaseQuantities` and so on.

Tekla Structures doesn't follow that split. We looked at four public Tekla
exports, including one Tekla 2026 model exported as IFC2X3, IFC4 and IFC4X3.
All of them write every `Qto_` set as a property set: 661 sets on elements,
and not one `IfcElementQuantity`. Two Allplan 2024 test exports do the same,
with German property names (`Länge`, `Dicke`, `Höhe`) that no `Qto_` template
defines. Allplan 2025 writes proper quantity sets.

This doesn't break an IDS check. IDS 1.0 property facets read both kinds of
set, and so do [IDS Model Check](https://marisstella.app/ids-model-check/) and
IfcTester. It did limit the model fill, though. When a model fails an IDS
because a quantity is missing, the fill can measure the value from the
element's body and write it in. That only happened when the element held the
set as a quantity set, or had no set of that name at all. On a Tekla model the
set always exists as a property set, so every missing `NetVolume` went to the
"type this in yourself" table. The column's body was right there to measure.

## Does the measurement agree with Tekla?

Before writing into Tekla's sets, we compared the geometry reading with what
Tekla already stores in them. We converted Tekla's millimetres to metres and
compared element by element:

- Tekla 2026 as IFC4: 150 of 151 values within 2%.
- The same model as IFC2X3: 165 of 183. As IFC4X3: 140 of 147. The beams that
  differ in those two exports agree in the IFC4 export, so the difference
  comes from how each export writes the bodies, not from the measurement.
- An older Tekla export: 96 of 102, leaving out wall side areas.
- In all: 551 of 583.

Wall side areas are the exception. Tekla stores `NetSideArea` as both faces
of the wall: 203 m² on a 28.6 m by 3.6 m wall. The `Qto_` definition means one
face. Tekla's figure isn't exactly twice one face either; it is 2.2% off. We
couldn't find the rule behind it, so the fill doesn't measure side areas into
a Tekla-style set. Writing either figure would disagree with the file's other
walls.

## What the fill does now

When the set exists as a property set, the fill writes the value into it
as a property of the right measure (`IFCVOLUMEMEASURE(0.0754)`), in the
model's own units, rounded to six significant figures. It doesn't add a
second set with the same name beside it.

We tested it with a cost-estimating IDS that asks walls, slabs, columns and
beams for their volumes and areas. On the three Tekla 2026 files, failing
elements went:

| Export | before the fill | old fill | new fill |
| --- | ---: | ---: | ---: |
| IFC2X3 | 97 | 29 | 17 |
| IFC4 | 117 | 49 | 37 |
| IFC4X3 | 116 | 48 | 36 |

IfcTester counts the same failures on all six filled and unfilled files. The
walls still failing are missing side areas, which the fill left alone on
purpose.

Method, numbers and file sources: `ventures/ids-model-check/eval/qto-psets-2026-11-23.md`.
The models come from two public repositories and are fetched, not copied, by
`eval/fetch-qto-psets.sh`.

*Estimates from the model's geometry, not professional advice: check measured
quantities before using them for costing or procurement.*
