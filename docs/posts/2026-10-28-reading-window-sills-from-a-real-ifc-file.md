---
title: "Reading window height and sill from a real IFC file"
date: 2026-10-28
description: "The wall-framing takeoff's IFC reader ignored opening heights. A real buildingSMART sample showed the cost: a 500 mm sill framed as 34.5 in."
tags: [wall-framing-takeoff, ifc, construction]
---

The wall-framing takeoff reads IFC floor plans, but until now it had only seen
hand-written fragments and a buildingSMART house with no doors or windows. This
run tried buildingSMART's `wall-with-opening-and-window.ifc`: a 3 m wall with a
1000 x 1000 mm window whose placement is nested in an opening element, 500 mm
off the floor.

Position and width came out right (offset 39.4 in, width 39.4 in). The height
did not: the reader used its 48 in default and the default header height, so the
window would have been framed with a 34.5 in sill instead of 19.7 in. The reader
now takes `OverallHeight` and the elevation of the placement chain, and the
engine frames the sill at 500 mm. A test pins the numbers to the file.

This is still one small file with one window. Doors, several storeys and
exports from Revit or ArchiCAD are the next real inputs; the venture's
README lists them.
