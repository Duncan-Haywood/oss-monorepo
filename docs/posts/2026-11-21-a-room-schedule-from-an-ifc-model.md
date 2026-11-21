---
title: "A room schedule from an IFC model, checked against what the exporter stored"
seo_title: "Room schedule from IFC: floor area, perimeter and wall area per room"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, estimating]
description: "IFC Quantity Takeoff now measures every room from its own solid, checks the stored figures and puts furniture and finishes in their rooms."
---

Finishes are priced room by room. The floor finish goes by floor area, the
skirting by perimeter, the wall finish by perimeter times height, and the
loose items by the room they stand in. An IFC model has the rooms (each
`IfcSpace` is a solid), and most exporters also write a few figures on each
room. [IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) can now
measure every room itself and tell you whether the stored figures can be
trusted.

## What it gives you

Drop a model on the page, or run `node cli.mjs model.ifc --rooms rooms.csv`.
Each room gets a line:

- **floor area and perimeter**, cut 1 cm above the room's floor, so a sloped
  ceiling doesn't shrink them;
- **height**, **wall area** (perimeter times height, before doors and windows
  come off) and **volume**;
- the stored figure next to each one, and if they disagree by more than 2%,
  the likely reason.

You can also group the bill of quantities by room (`--by space,class`), so a
room's ceilings, floor finishes and furniture come out as lines of their own.
Click a room on the page and the 3D view shows just its contents.

## Getting the perimeter right

The geometry code stores a solid as a signed sum of convex pieces. That keeps
volumes and areas exact, but an L-shaped room cut into two rectangles has a
shared edge, and adding up the pieces' perimeters counts that edge twice. The
fix is to give each cut edge a direction: counter-clockwise for a piece that
adds, clockwise for a cut. Then collect the edges that lie on the same line.
A shared edge runs both ways and cancels; a cut removes exactly the part of a
piece's edge it takes away. Whatever is left is the room's outline. Faceted
rooms go through the same code, one edge per triangle the plane crosses.

## What the stored figures said

Thirteen public models have rooms, 991 in all. Measured against each room's
solid, the stored figures held up like this:

| | agree | disagree, cause named | disagree, unexplained |
|---|---:|---:|---:|
| floor area | 528 of 535 | 5 | 2 |
| perimeter | 472 of 475 | 0 | 3 |
| height | 501 of 535 | 34 | 0 |
| volume | 213 of 535 | 314 | 8 |

The disagreements turned out to be more interesting than the agreements:

- **ArchiCAD's net floor area is not the floor.** On the FZK-Haus test model
  the net area is the gross area times 0.97, a plaster allowance set in the
  room's own properties. The room's solid matches the gross area on 7 of 7
  rooms, so the check reads gross first and the CSV shows both figures.
- **A Norwegian school writes room volumes in litres.** On 241 rooms the
  stored volume is exactly 1,000 times the solid. On 57 more it is floor area
  times the room's nominal 2.9 m height, still in litres, over ceilings
  dropped to 2.65 m.
- **One house writes areas in square millimetres** under a square-metre unit.
  That makes every floor area in it a million times too big.
- **Some rooms are exported with no 3D body.** One Dutch model's rooms are a
  plan outline and a bounding box (94 of 100). Read from those, all 100 floor
  areas, perimeters and heights agree. Eleven top-floor volumes come out
  higher than stored, because those rooms sit under the sloped roof.

## Putting elements in rooms

Some files say which room an element is in: one model places 1,268 pieces of
furniture that way. Most leave it out. For those, the tool tests a point in
the middle of each element's plan, 10 cm above its bottom, against every
room's solid. Then it tries half height, then 10 cm under the top. That
placed 1,024 more elements across the 13 models.

The first run taught two rules. That school draws its rooms to the wall
centrelines, so 901 walls and 306 doors landed inside whichever room was
tested first. Walls, doors, windows, slabs and frames bound rooms rather than
stand in them, so they are now never placed by geometry. And Revit rooms stop
at the underside of the ceiling, so none of one office's 83 ceilings sat
inside a room. A ceiling is now also tested just below itself, and all 83
found their room.

The full figures are in the venture's
[eval/rooms-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/rooms-2026-11-21.md).
Next is net wall finish per room: taking the doors and windows off each
room's walls, using the space boundaries that some exporters write.
