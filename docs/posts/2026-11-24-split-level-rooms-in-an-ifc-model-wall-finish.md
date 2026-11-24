---
title: "Split-level rooms in an IFC model: the wall finish the room solid leaves out"
seo_title: "Split-level rooms in IFC: wall finish below the room solid"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, bim, estimating, finishes, ventures]
description: "Some exporters draw every room from the storey's level, even over a sunken floor. The free IFC takeoff now finds the lower slab and measures walls to it."
---

A room schedule from an IFC model takes each room's wall finish as its
perimeter times its height. Both come from the room's solid (the `IfcSpace`
body). That holds as long as the solid sits on the floor. In one of the
public test models it doesn't, and the free
[IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/README.md) now
checks for it.

## What was wrong

Three openings in `HouseZ` (a window and two doors) started 0.51 m below
their room's floor. The takeoff cuts each door and window to the room's
height band, so 0.51 m of each came off nothing and 2.1 m² was left out.
We couldn't say from the numbers alone whether the openings or the rooms
were wrong.

On the model, the openings were right. The ground floor is a split level:
under the west of the house the slabs' tops are at −0.51 m, under the east
they're at 0. The walls, doors and window in the west run down to −0.51 m.
Every ground-floor room, though, was drawn from the storey's level, 0 to
3.15 m:

| room | over the lower floor |
|---|---:|
| Washing Room | 100% |
| Parametricos Office | 54% |
| GF Hallway | 18% |

So the openings shouldn't have been cut, and the gross wall was short by
the 0.51 m band between the slab and the bottom of the room's solid.

## What the takeoff does now

It samples each room's plan on a 20 cm grid and finds the highest slab
under each point. A slab more than 25 cm below the room's solid counts as a
lower floor. Up to 25 cm it's treated as floor build-up, because one model
sets its door frames 15 cm into the screed. A room needs 5% of its plan
over the lower floor, or the edge of a big zone sitting over a lift pit
would count. For each room that qualifies, the takeoff:

- adds the wall band down to the slab to the gross wall area, and keeps
  the solid's own figure beside it;
- measures the doors and windows standing on the lower floor down to it;
- marks the room's wall area with a star in the page's room schedule, with
  a note naming the slab.

On HouseZ the three rooms gain 16.6 m² of wall, the openings come off
whole, and the house's net wall goes from 292.9 to 307.4 m² (+4.9%). In the
other 11 public models (984 rooms) one room is flagged: a lift shaft whose
pit slab is 1.1 m down. Whether a pit's walls belong in a finish schedule is
for the estimator to decide. The figures and the method are in
[eval/floors-below-2026-11-24.md](../../ventures/ifc-quantity-takeoff/eval/floors-below-2026-11-24.md).

## A second look: windows into "ROOF"

The same check list held a second question. On `dental_clinic`, the file
bounds 18 windows only to a space called "ROOF". On the model, those spaces
are Revit rooms drawn over the first floor's flat roof, outside the second
floor's walls, and every one of the windows is external. Since a change
on 2026-11-23, each window also comes off the office behind it. The
offices' figures are right. The roof spaces' own wall figures describe
rooms that stand on a roof, so they aren't a finish anyone would price.

## What it doesn't do yet

It doesn't add the riser between a room's two floor levels, which is wall
finish too. A sloped slab is read at its highest point. A floor drawn as a
covering rather than a slab isn't looked for. A shower tray or a stepped
bathroom less than 25 cm deep is read as build-up. These are open items in
the venture's NEXT.md. No estimator has checked the figures.
