---
title: "Two real building models broke our IFC reader, so we wrote one in Rust"
seo_title: "Reading walls, joins and doors from real IFC models for framing"
date: 2026-11-03
tags: [construction, ifc, bim, rust, open-source]
description: "On a real Revit model our IFC reader found no closed outline and placed 2 of 10 doors and windows. A Rust reader fixes both and matches IfcOpenShell."
---

The wall framing takeoff could already read an IFC file, the open format architects' tools export. It had only been tested on files we wrote by hand. This week it got two real models from buildingSMART's public sample set (CC BY 4.0): the Duplex Apartment, exported from Revit, and the Schependomlaan design model, a 49 MB ArchiCAD model of a Dutch housing block.

On the Duplex's first floor the reader found 20 walls, **no closed exterior outline**, and placed **2 of its 10 doors and windows**. Two things it had assumed are wrong in real exports:

- **Wall lines don't touch at corners.** Revit stops each wall's reference line about 0.21 m short of the corner, or runs it past. The file does say which walls meet and how, in `IfcRelConnectsPathElements` records (start, end, or somewhere along the other wall).
- **A door's position is not the edge of its opening.** The file links each wall to an opening element and the opening to the door or window that fills it. The opening element has a body: a box you can project onto the wall.

So we wrote [`ifc-engine`](../../ventures/wall-framing-takeoff/ifc-engine/README.md), a Rust reader that uses those relationships. It intersects the lines at each joint the model names, and merges walls that ArchiCAD split into pieces. It places every opening by its own body. Doors and windows with no relationship (most of them in the ArchiCAD model) go on the wall their body overlaps. It also reads each wall's material layers, so the takeoff can see a "Metal - Stud Layer" or a "Wood Stud" and its depth.

To check it we compared the results with [IfcOpenShell](https://ifcopenshell.org/), the open IFC geometry kernel, on both models. Every wall's base and height, and every related opening's start, end, sill and height along its wall, agree to 0.0000 m. On the Duplex the exterior walls now form one closed 8.38 × 17.38 m outline on centre lines, and all 36 doors and windows the model relates to a wall are placed on that wall. The reader indexes the 49 MB model and reads it in 1.08 s with 82 MB of memory. The old JavaScript reader took 4.35 s and 775 MB.

The takeoff now gets far enough on these models to object to them. It flags a door and a window 0.1 m apart on an exterior wall, too close for separate king studs, and two partitions that meet their walls 10 mm inside a door's rough opening. Both models are masonry buildings, so these objections check the reader, not a framing result. What we still need is a real wood-framed US house model. If you have one you can share under an open licence, it is the most useful thing anyone could send this project.

What's next, in order: compile the reader to WebAssembly so the takeoff's web page uses it; apply roof clipping so gable walls get their real top edge; turn the stud layer into a stud size per wall. The project plan, about 340 hours in all, is in the reader's README.
