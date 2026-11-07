---
title: "Real wall heights make a real house stop framing"
date: 2026-11-07
description: "Reading each wall's and door's height from a Revit model, instead of defaults, shows where the Schultz Residence's doors do not fit under its plates."
tags: [construction, ifc, wall-framing-takeoff]
---

A DXF floor plan carries wall places and opening widths, nothing else. The wall-framing takeoff had been framing the Schultz Residence's three upper floors at its default 92-5/8 in stud and 82.5 in doors, so every floor "worked".

The CLI now takes the IFC reader's JSON for the same storey (`--ifc-json=`) and uses the model's own heights: wall by wall, door by door. The walls run from 81 in to 11 ft 5 in (sloped-ceiling and garage walls). With real heights, the 1st Floor stops on 6 openings, the 2nd on 2 and the 3rd on 2.

Some of those are real conflicts: a door 85-1/2 in tall under a plate line at the same height leaves no room for any header. One is the matcher's fault: stacked awning and casement units that share one offset get paired with the wrong door, which gives a French door a 39 in sill. That is the next fix. No framer's takeoff has been compared; the model is one house.

Code and the run's numbers are in `ventures/wall-framing-takeoff/` (README, "Schultz" section).
