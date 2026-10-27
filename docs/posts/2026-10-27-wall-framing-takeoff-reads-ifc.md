---
title: "Wall framing takeoff now reads IFC floor plans"
date: 2026-10-27
description: "After DXF, wall-framing-takeoff reads IFC building-model files: wall axes, nested placements, doors and windows. Tested on hand-written fragments only."
tags: [wall-framing-takeoff, construction, ifc]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) turns a floor plan into a stud, plate and header list. It read DXF; it now also reads IFC, the open format Revit, ArchiCAD and Vectorworks export.

`node cli.mjs house.ifc` reads each wall's axis line, composes the nested placements into world coordinates, takes the length unit from the file, and turns doors and windows into openings of their stated width. Then the same wall logic as the DXF route finds the exterior loop, the tees and the opening offsets.

What it has not seen is a real export. The tests are hand-written IFC4 fragments, so swept-body walls with no axis, openings placed by their centre, and multi-storey files are the likely first failures. The README lists them. Estimates only, not engineering advice.
