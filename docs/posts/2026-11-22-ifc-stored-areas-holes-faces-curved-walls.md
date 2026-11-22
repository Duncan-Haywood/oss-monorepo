---
title: "Why an IFC model's stored areas disagree with its geometry: holes, faces and curved walls"
seo_title: "Why IFC stored areas disagree with the geometry"
date: 2026-11-22
tags: [ifc-quantity-takeoff, ventures]
description: "On eight public BIM models, 117 stored areas had no known reason to differ from the geometry. 103 now have one, each exact to the digit."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads a
building model in the browser, cuts every wall, slab, covering and member from
its own geometry, and checks the areas the authoring tool stored against those
cuts. When a figure disagrees, the checks panel says why if it can: a wall
split by level, a net area written as gross, a figure in the wrong unit. On the
eight public models we test against, 117 of 12,167 stored areas still
disagreed with no reason given. Today's run went through them one by one.
103 now have a cause, and in each case the file or the geometry gives the
stored figure exactly, usually to four digits or more.

**Slabs with holes (14).** ArchiCAD's GrossArea for a slab is its outline.
It equals the slab's NetArea plus the file's own "Holes Surface Area", to the
last digit, on all 14 slabs in the Dutch house model: a cast ground floor
storing 123.46 m² over a 27.32 m² slab with 96.14 m² of holes, and pitched roof
decks with their roof-light holes. The holes are part of the slab's own
outline, not separate openings, so the geometry has no "gross" to compare
with, and the check could not explain the gap until it added them back.

**Knee walls (12).** Walls in the attic are trimmed under the roof, so their
two faces differ. The stored side area is the mean of the two faces as the
engine cuts them (0.0773 and 0.0449 m² give the stored 0.0611). An earlier
rule found the same mean only through ArchiCAD's German property names. This
model writes them in English, so the rule now uses the geometry's two faces
and needs no names at all.

**Coverings drawn as walls (20 figures), and one flat face (12).** Façade
insulation, tiling and roof upstands modelled with ArchiCAD's wall tool are
exported as coverings but keep the wall's quantities: their area is the
wall's centre length times its thickness. A window sill extruded along its
length stores its underside, not its end profile. A concrete corbel
extruded sideways stores one of its sides. Both now match one plane of the
body's faces, summed plane by plane.

**Walls on a curve (10).** The last ten in a Norwegian school model are Revit
walls built on a quarter circle. A plane cut through a curved wall gives a
chord, 0.76 m² against a stored 2.59 m². Every one stores its **outer** face,
(length + width/2 × π/2) × height, where the length is Revit's centre line,
and matches to 0.000%. The engine now spots a wall that bends in plan: its
side faces point in many directions and no single direction carries half their
area. It says that a plane cut cannot measure that wall, and does not report
a disagreement.

None of this changes a total. Every one of the 103 keeps the stored figure,
which is what the bill of quantities already summed. What changes is the
checks panel and the element CSV. A quantity surveyor scanning for figures to
distrust now sees 14 unexplained areas in place of 117, and each of the other
103 says what the exporter measured. The 14 left are listed in the
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/curved-and-faces-2026-11-22.md).
They are three zinc copings whose bodies the face reader cannot take apart
yet, three timber frame panels, three straight walls, and two round columns
that store 40 times their section.

What this does not show: three of the five causes come from one ArchiCAD
model and the curved walls from one Revit model. Each needs another export to
confirm it. The engine's own area for a curved wall is still a plane cut,
which is wrong wherever the file stores nothing to fall back on. Measuring the
curved faces themselves is the next step.

*Quantities are estimates read from the model's geometry and its stored
figures. They are not professional advice. Check them before you price
anything.*
