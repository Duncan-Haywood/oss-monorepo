---
title: "A French door that floats 39 inches up: the framing engine was right"
seo_title: "IFC door sill 39 in: model placement, not a takeoff bug (Schultz Residence)"
date: 2026-11-09
tags: [construction, wall-framing, ifc]
description: "Tracing a refused wall in a real Revit house back to its source: the file places the door 0.994 m above the wall."
---

Our wall-framing takeoff refuses one wall of the Schultz Residence, an open
Revit export, because a French door "should reach the floor" but reads a 39 in
sill. Yesterday's guess was that the engine lost the lower part of the door's
geometry. This run tested the guess instead of patching around it.

The door's geometry runs 0.994 m to 3.013 m above the wall base, 2.019 m tall.
That equals the door's own declared height (6.625 ft), so nothing is missing.
The door's parent placement in the file sits 3.26 ft above the wall's, and the
casement beside it is raised the same way, while the other casements on that
wall start at 0.286 m and the second French door at 0.041 m.

So the engine reads the file correctly and the file puts that door up in the
air. A takeoff cannot tell a modelling slip from a raised bay, so the right
output is a refusal with the reason, which it gives; `--skip-refused` steps over
the wall. The next check is a framer's takeoff or the architect. No code changed;
the finding is in the venture's ROADMAP. It is one house and one wall.
