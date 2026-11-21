---
title: "A room is not a storey: floor-by-floor views and a section plane for IFC takeoff"
seo_title: "Floor-by-floor IFC views and section cuts, in the browser"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, webgl]
description: "IFC Quantity Takeoff's 3D view now hides storeys and cuts sections. Building the storey list showed a school model's 5 floors as 198."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) draws a model
in 3D from the same solids its volumes are computed from. Until today it
drew the whole building at once, which is fine for a house and no use for a
school: you cannot see the ground floor's partitions through four floors
of slabs. So the view now has two things every model viewer has, still
with no library.

## Storeys, one at a time

There is a tick box per storey, listed lowest first with its elevation and
how many elements it holds. Untick the ones you don't want. Nothing is
re-meshed or re-uploaded: the elements of each storey are runs in one
vertex buffer, and the view simply draws fewer runs. If you then click a
bill-of-quantities line whose elements are on a hidden floor, that floor
comes back on.

## A section plane

Pick a plan cut, or a vertical cut across x or y, and drag the slider. The
cut happens in the shader, for drawing and for picking, so a click only
ever selects something still standing. Solids that are cut show their
inside faces in flat grey, which reads much like the poché on a drawn
section. A plan cut starts 1.2 m above the bottom of what is shown, about
where a floor plan is cut. It uses the elements' boxes, not the storey's
stated elevation, because elevations are relative to the building: one
public model's floor "0,000" sits at 498.3 m in world coordinates.

## What the storey list found

The first storey list for a 56 MB school model (ARK_NUS, one of the public
test files in the ThatOpen web-ifc repository) had 198 entries: its five
floors and 193 room numbers. The exporter places furniture, fittings and
some walls in an `IfcSpace`, and the takeoff had taken whatever spatial
element contained an element as its storey. That was not only a viewer
problem: "group the bill of quantities by storey" gave you rooms.

Now an element contained in a room climbs the spatial tree to the
`IfcBuildingStorey` above the room, and keeps the room's name as its space.
On seven public models:

| Model | Storeys listed before | After | Elements moved |
|---|---:|---:|---:|
| ARK_NUS school | 198 | 5 | 1,268 |
| kleine_Wohnung | 15 | 4 | 37 |
| FZK-Haus, C20 Institute, HouseZ, IfcOpenHouse, Mini Project | unchanged | | 0 |

The Uniformat II grouping reads a storey's elevation to tell basement
walls from upper ones, so moving 1,268 elements could have recoded them.
None moved: what sits in rooms is furniture, fittings and partitions, which
that rule leaves alone.

The checks, the browser run and what is left (meshing in a worker, capped
cut faces, a straight-down camera for plan cuts) are in
[eval/storeys-and-sections-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/storeys-and-sections-2026-11-21.md).
The tool is free and runs entirely in your browser; its quantities are not
a measured survey or a cost estimate.
