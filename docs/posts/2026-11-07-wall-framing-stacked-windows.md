---
title: "A French door under an awning no longer reads the awning's sill"
date: 2026-11-07
description: "The wall-framing takeoff now tells stacked IFC openings apart by width and lowest sill, fixing a door framed with a 39 in sill."
tags: [ventures, wall-framing-takeoff, ifc]
---

When a model stacks an awning window over a French door, both share one offset along the wall. The takeoff matched each DXF opening to the nearest model opening by position alone, so on the Schultz Residence the French door picked up the awning's 39 in sill and the plan refused to frame that wall.

The DXF opening's width now goes into the match. A unit of that width wins, and among equal widths the lowest sill does. A unit test covers the stacked case. The 85 dxf, ifc and CLI tests pass.

Not done: the Schultz file has not been re-run with the change, and there is still no way to let a refused wall through. Details are in `ventures/wall-framing-takeoff/README.md`.
