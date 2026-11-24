---
title: "The last three areas in doubt were a brick band's underside"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, bim, archicad, quantity-takeoff, ventures]
description: "Three ArchiCAD coping areas six to nineteen times their profile were the flat underside. Reading faces off a body built from signed pieces named them."
---

The [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/)
reads a BIM model in the browser and turns it into a bill of quantities. It
checks every quantity the model stores against the geometry. When the two
disagree and it cannot say why, the bill's line marks the figure "in doubt".

After [this morning's Revit walls](2026-11-24-revit-gross-wall-area-is-one-face-net-of-openings.md),
3 areas were left in doubt over 15 public models, all in one ArchiCAD house
(schependomlaan, in the `web-ifc` test files): three `afdekker` coverings
storing 0.0611, 0.119 and 0.195 m2 where the takeoff computed 0.0101 m2 for
each.

## What they are

Each is a precast brick band ("Vebo spekband SB 60/70x150"), a profile 150
mm wide and 70 mm high with a drip groove underneath, extruded along its run:
470, 915 and 1,500 mm. ArchiCAD's own quantity set on the first one gives it
away:

| ArchiCAD quantity | value | what it is |
|---|---:|---|
| Bottom Surface Area | 0.0611 m2 | the flat underside, 130 mm (groove left out) x 470 mm |
| Top Surface Area | 0.0517 m2 | the flat top, 110 mm x 470 mm |
| GrossArea, NetArea | 0.0611 m2 | the same as Bottom Surface Area |

The takeoff's 0.0101 m2 is the profile, which is what an IFC covering's
"area" usually means for a cladding panel extruded upward. For a band
extruded sideways the exporter chose its underside.

## Why it took a code change

The takeoff already has a rule for this: when a stored area is one flat face
of the body (a sill's top), it names it. It could not look here, because a
profile with an arc in it is built as a signed sum of pieces, and the face
reader refused any body of more than one piece: pieces share inner faces
that are not the surface.

Add the faces up with their signs and the shared ones cancel: one piece's
face points one way, its neighbour's the other, in the same plane. What is
left in each plane is the body's own boundary. With that, the copings'
underside plane reads 0.0611, 0.11895 and 0.195 m2, matching the stored
figures to nine decimals.

## What it changed

Six rows on one model changed their named cause, and none on the other 14.
The bill's totals are the same to the last digit on all 15: the stored
figures were summed before and still are, but their lines no longer warn.
Now 14 of 15 models have nothing in doubt. The one figure left is a Revit
wall's volume, 2% above its body, that no rule we can show explains yet.

Details and the full before-and-after list:
[`eval/signed-faces-2026-11-24.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/signed-faces-2026-11-24.md).
Three elements of one profile in one model are not a rule about ArchiCAD in
general; a second export with sideways-extruded coverings would test it.
