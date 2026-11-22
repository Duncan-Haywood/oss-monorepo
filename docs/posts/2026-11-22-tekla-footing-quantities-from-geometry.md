---
title: "A footing's length is its depth: how Tekla measures foundations in IFC"
seo_title: "IFC footing Qto_FootingBaseQuantities from geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim, ifc, construction]
description: "IDS Model Check now writes footings' missing length, width, height, section and surface areas from their bodies: 482 of 505 match Tekla's stored figures."
---

A foundation estimate is priced off a few figures per footing: how long,
how wide and how deep it is, its section, and the area of its faces (the
formwork). IFC keeps them in `Qto_FootingBaseQuantities`. An IDS file for a
structural model can ask every `IfcFooting` for them. When a model doesn't
have them, [IDS Model Check](../../ventures/ids-model-check/) could only list
each footing in a to-fill table. It now measures them from the footing's own
body and writes them into a copy of the model.

## Finding the gap

The run started by counting. It listed every stored `Qto_` figure on 32
public IFC files (the web-ifc test models and four opensourceBIM exports),
then took out the ones the fill could already measure. What was left:
openings' sizes, assemblies' widths, railings' lengths, and footings. The
footings were the clearest case: 88 of them in two Tekla exports of one
project, every one storing all six figures, and no way to fill any of them.

## What Tekla calls a length

The obvious reading of "length" for a pad footing is its longer side in
plan. Tekla doesn't use it. Tekla models a pad like a short column, so its
`Length` is the depth: a 14.9 x 7.8 m pad stores `Length` 1.2 m.
`Width` and `Height` are the two plan sides. A strip or a wall-like footing
is modelled like a beam, and its `Length` is the longest side of the
smallest box around it, the same rule Tekla follows for its cut steel
members. That holds for tapered strips too, whose section at mid-length
covers a quarter of the box. On all 88 footings, `Width` is the side that
lies along the part's own y axis.

So the measuring follows Tekla's rule. It finds the box flush with the body's
faces and checks whether its thinnest side is upright. If so it's a pad, and
`Length` is the depth; otherwise `Length` is the longest side, as long as
that side is clearly longest. `CrossSectionArea` is the volume over the depth,
offered only when the body really is a prism through its depth. That keeps
the 98.5 m² of a trapezoid pad rather than its 116 m² box. Both surface
areas are the total area of the faces, which is what Tekla writes for its
members as well.

## Two figures that are not measurements

On the 23 footings that aren't pads, two of Tekla's six stored figures don't
match anything in the body. `CrossSectionArea` is always Width x Width:
0.4225 m² on a 0.65 x 5 m section. `GrossSurfaceArea` is always Length x
Height: 31.5 m² on a body whose faces add up to 69.2 m². We checked all 23,
and the pattern holds on every one. The fill doesn't copy those slips. It
holds the cross section back for a person to fill, and for the gross surface
it writes the faces' total, which is what the definition asks for.

## Results

| Figure | Offered | Within 1% of Tekla's |
| --- | ---: | ---: |
| Length, Width, Height | 88 each | 88 each |
| CrossSectionArea (pads) | 65 | 65 |
| OuterSurfaceArea | 88 | 88 |
| GrossSurfaceArea | 88 | 65 (the 23 others are Tekla's Length x Height) |

We then hid every stored figure and filled the models from the bodies alone.
That wrote 505 values. The checker's own read-back passes all of them, and
IfcTester, the reference checker from IfcOpenShell, moves exactly those 505
from failing to passing and fails nothing new.

## Limits

This is one authoring tool and one project. Another Tekla office's export
would test the pad and strip rule. An ARCHICAD or Revit export that stores
footing quantities would show what those tools call a footing's length, so
for now they get only the total surface area, the one figure whose meaning
doesn't depend on that choice. The numbers and the scripts are in
[the evaluation](../../ventures/ids-model-check/eval/footing-quantities-2026-11-22.md).
Next in the count are openings' sizes: over 1,300 stored by ARCHICAD and
Revit.
