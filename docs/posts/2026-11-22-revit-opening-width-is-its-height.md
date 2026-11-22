---
title: "Revit stores a window opening's height as its Width, on purpose"
seo_title: "IFC opening Width, Height, Depth from geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim, ifc, construction]
description: "IDS Model Check now writes an IFC opening's Width, Height, Depth and Area from its body. 4,532 of 4,554 match what ARCHICAD and Revit stored."
---

Every door, window, shaft and duct sleeve in an IFC model is cut out of its
wall or slab by an `IfcOpeningElement`. Its `Width`, `Height`, `Depth` and
`Area` (`Qto_OpeningElementBaseQuantities`) are what a demolition quote, a
core-drilling order or a fire-stopping schedule reads. An IDS file can require
them. When a model left them out, [IDS Model Check](../../ventures/ids-model-check/)
could only list each opening in a to-fill table. It now measures them from the
opening's own body and writes them into a copy of the model.

## Who stores what

Eight public exports store the set: four from ARCHICAD (389 openings) and
four from Revit 2010, 2019 and 2022 (1,070). No other tool's public export
does. The two tools don't measure the same things.

**ARCHICAD** draws each opening as two extrusions of one profile, mirrored
through the wall's middle. `Width` is the profile's side across the wall,
`Height` its upright side, `Area` the profile's own area (a round window
stores its polygon's 0.785 m², not 1 m²). `Depth` isn't either extrusion's
length. It is the thickness of the wall being cut: a round window's two
extrusions run 0.485 m and 0.415 m through a 0.30 m wall, and 0.30 is the
figure stored. That holds on 359 of 359 openings in walls.

**Revit** stores `Depth` as the extrusion's length, whatever it cuts through.
A window's cutter runs 10 feet, so 3.048 m is stored for an opening in a half-metre
wall. Width and Height were the surprise. The obvious rule ("Height is the
upright side") matched only 186 of the Revit 2019 school's 775 wall openings.
The exporter's source code explains why. Its rectangle writer turns a wall
opening's profile on purpose, so that "the 'X' direction of the profile
corresponds to the global Z direction". Revit 2019 and 2022 then store that x
side as `Width`. On 589 of the 775, `Width` holds the window's height. Read
as "Width is the profile's x side", 775 of 775 match. Floor openings store
the y side as `Width`. Revit 2010, from before that code, stores the y side in
both cases.

So the fill follows each tool's own rule, chosen from the application the
opening's owner history names. Revit 2011 to 2018 exports store no set in any
public file, so no rule is assumed for them and they get nothing.

## How close it gets

Of the 4,554 figures offered, 4,532 are within 1% of the stored ones (worst
0.57%). All 22 others were read by hand, and each is an export slip rather
than a measuring error. One roof stores its whole 240 m² or 1,015 m² area on
each of its openings. One Dutch house stores a 0.30 m `Width` on four
windows whose openings are 1.53 m wide.

To test the fill, every stored figure was renamed so the models held none,
and then an IDS asking for all four on every opening was filled from geometry.
That wrote 5,806 values on seven files. IfcOpenShell's IfcTester opens every
filled file and moves exactly those 5,806 values from failing to passing,
with nothing newly failing.

## What it doesn't do

ARCHICAD also stores `Volume` on every opening. No reading of the geometry
gives it (0.086 m³ for a 0.885 × 2.01 × 0.24 m door), so it isn't offered.
Revit 2022 exports some openings as advanced B-rep bodies rather than
extrusions (102 of 168 in one flat), and those get nothing yet.

The method, every count and the scripts are in
[`eval/opening-quantities-2026-11-22.md`](../../ventures/ids-model-check/eval/opening-quantities-2026-11-22.md).
