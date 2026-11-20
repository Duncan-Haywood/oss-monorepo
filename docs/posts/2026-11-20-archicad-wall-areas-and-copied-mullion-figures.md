---
title: "Why ArchiCAD's wall areas come in under the geometry, and mullions that carry a whole curtain wall"
seo_title: "IFC wall side areas: ArchiCAD finishes figures explained"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Two causes found in public IFC models: ArchiCAD takes T-joined walls off a wall's side area, and Revit mullions store their curtain wall's area on every piece."
---

The free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
checks every area a model stores against an area it cuts from the model's own
geometry, and says why when the two disagree. After this morning's work, 358
of 12,167 stored areas across eight public models still had no explanation.
Two groups made up almost half of them. Both now have a cause, and in both
cases the explanation came from the file itself.

## ArchiCAD measures walls the way a painter would

In the C20-Institute model, wall Wand-002 is 18 m long and 2.7 m high. The
geometry gives 48.6 m² per face, and so do ArchiCAD's own gross face figures.
But its `BaseQuantities` say GrossSideArea 46.845 m² and NetSideArea 28.845 m².

ArchiCAD's own quantity set in the same file explains it. The net area of the
outside face is 30.60 m² and of the inside face 27.09 m². Their mean is
28.845, which is the stored net area. Add back the 18 m² of windows and you
get 46.845, the stored gross area.

The inside face comes out smaller because five 0.2 m partitions stand against
it, and the strip each one covers will never be plastered or painted. The
file records those joins (`IfcRelConnectsPathElements`, with the partition's
end on the wall's path). So the rule needs no vendor-specific names: take the
computed side area, subtract the joined walls' widths times the height, and
halve it, since only one of the two faces is covered. That reproduces 37
stored areas exactly. 18 more match the mean of ArchiCAD's own two face
figures, but the recorded joins only explain part of the gap. In Wand-002's
case they cover 1.0 of the 1.3 m. The rest is probably a corner, which we have
not checked.

Which figure is right depends on the trade. For finishes, the stored area,
net of abutting walls, is the one to price. For formwork or masonry, it's the
middle-plane area. The page now labels these stored figures as trustworthy,
and the reason it gives says which kind of figure each one is.

## A mullion that stores a whole curtain wall

In the skolebygg model, 59 mullions of one type all store CrossSectionArea
138.4225 m² and Length 20.858 m, although their bodies run from 0.27 to
3.63 m and their section is 0.01335 m². Curtain wall #45538 in the same file
carries a Revit area of 138.422511233018 and a length of 20858.000170668 mm,
matching to the last digit. The exporter copied the host's figures onto every
mullion. Another 52 mullions do the same with a smaller curtain wall. Revit's
own per-mullion volume divided by length gives the section the tool computes.

The new `host-figure` rule catches this pattern: three or more members
storing the same length and area while their bodies differ in length. It
catches exactly those 111 mullions and nothing else on the eight models. The
bill of quantities uses their computed section instead.

## Where it stands

Unexplained disagreements went from 358 to 192. The full numbers, and what
this doesn't show (two exporters, three files), are in the venture's
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/joins-and-host-figures-2026-11-20.md).
The model never leaves your browser.
