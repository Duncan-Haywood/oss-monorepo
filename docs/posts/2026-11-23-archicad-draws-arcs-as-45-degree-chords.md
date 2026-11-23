---
title: "ArchiCAD measures arcs as 45-degree chords, and round columns as 20-gons"
seo_title: "ArchiCAD stores arcs as 45-degree chords, round columns as 20-gons"
date: 2026-11-23
tags: [ifc, quantity-takeoff, archicad, bim]
description: "Two ArchiCAD profiles match their stored volumes to seven digits once every arc is drawn as 45-degree chords; round columns are circumscribed 20-gons."
---

The free [IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/index.html) checks every volume an exporter stores in a model against the volume it computes from the geometry. When the two differ by more than 2% it tries to say why. It already knew that Tekla works out steel volumes on a section with no fillet radii, and that ArchiCAD leaves the glass out of a window's volume. Small differences under 2% just showed as "agrees".

Two zinc copings in the public schependomlaan model (an ArchiCAD export) were still unexplained: their stored section is 3.6% bigger than the profile in the file. The obvious next step was a second ArchiCAD profile to compare with. That turned out to be in the same model.

## Seven digits

schependomlaan has two other drawn profiles with arcs that also carry ArchiCAD's own `End Surface Area` and `Net Volume`:

| Profile | True section | ArchiCAD stores | Arcs as 45-degree chords |
|---|---:|---:|---:|
| L100x10 steel angle (6 beams) | 1,903.434 mm² | 1,904.686 | **1,904.686** |
| Sill with a round groove (3) | 10,142.959 mm² | 10,158.612 | **10,158.612** |

Replace every arc in the profile with equal chords of 45 degrees and the area matches the stored figure to the last printed digit, on both profiles. Steps of 30, 22.5, 15 and 10 degrees all miss. The stored figure comes out higher than the true one because both profiles have concave arcs (the sill's groove, the angle's root fillet), and a chord across a concave arc adds material.

The steel angles' standard `CrossSectionArea` field holds the exact 1,903.434. Only ArchiCAD's own quantities use the polygon.

## A different polygon for columns

A model from another office, C20, has two round 200 mm columns. They store 0.0855276 m³ against the circle's 0.0848230, which is 0.83% more. That is exactly a 20-sided polygon whose sides touch the circle: 20 × 0.1² × tan 9° × 2.7 m. The stored outer surface area is that polygon's perimeter times the height, to eleven digits. So ArchiCAD's column tool and its profile tool draw curves in two different ways.

## What changed in the tool

A new cause, `polygon-section`, is attached when a stored volume equals one of those two polygons to 1 part in 10,000. It applies even inside the 2% agreement. The bill of quantities then uses the geometry, which follows the real arcs. Across 13 public models, 19 stored volumes on 11 elements get the cause. Of the 296 other elements with arcs or circles that store a volume, none match, Tekla's and Revit's included. That is what you would expect if the matches are not chance.

These differences are 0.07% to 0.8%, too small to change a quantity surveyor's totals. What the rule adds is a reason. When a stored figure is off, it is better to know the exporter rounded a curve into straight lines than to wonder whether the model is wrong.

## The copings are still open

Drawing their arcs as 45-degree chords takes the copings further from the stored figure, not closer. Their outer band loses more than the inner gains. No pair of chord counts fits them except by chance. They stay unexplained, and the tool already uses their geometry. Testing them needs a second ArchiCAD model with thin bent-sheet profiles such as flashings or gutters.

Method, numbers and what this does not show: [eval/archicad-polygon-sections-2026-11-23.md](../../ventures/ifc-quantity-takeoff/eval/archicad-polygon-sections-2026-11-23.md).
