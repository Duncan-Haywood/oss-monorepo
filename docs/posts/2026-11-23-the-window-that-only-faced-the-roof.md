---
title: "The window that only faced the roof: 20 doors a BIM file bounded on one side"
date: 2026-11-23
tags: [ids-model-check, ifc-quantity-takeoff, ventures, bim, cobie]
description: "Geometry put 20 doors and windows in a room the IFC file did not name. All 20 were the file's slip. Now the takeoff fills in the missing side."
---

[IDS Model Check](https://marisstella.app/ids-model-check/cobie.html) writes a
COBie handover workbook from an IFC model, and its sister tool
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) takes
each room's doors and windows off its wall area. Both use two sources to say
which rooms an opening faces. One is the file's own space boundaries
(`IfcRelSpaceBoundary`). The other is geometry: a point 20 cm either side of
the opening, through its wall, tested against each room's solid.

On 25 public models the two agreed for 821 of 869 openings. In 20 cases
geometry found a room the file did not name. The earlier run left those 20
open. This run looked at each one.

**18 windows in a dental clinic.** Every window in `dental_clinic.ifc` that
has a space boundary names one space only: `2R01 ROOF` or `2R02 ROOF`. Those
are spaces Revit modelled over the lower roofs, outside the second floor.
None of the 18 names the office it is in. Geometry finds the office on one
side at 20, 60 and 100 cm, and the roof space on the other side. The window
sits inside the office's height band, and the file bounds the host exterior
wall to both spaces. So the office had lost its window. Its net wall area
was too high by the window's 1.7 m², and in the COBie sheet the window's
room was the roof.

**2 doors in a Dutch house.** In `schependomlaan.ifc` one bedroom door is
bounded to the hallway only, and that bedroom has no door in the file at all.
The same door type one floor down is bounded to both the hallway and its
bedroom. The other door, between a store and the entrance hall, names only
the store. Every probe on the far side lands in the hall.

**The change.** When the file names an opening on one side only, the takeoff
now runs the geometry test too. If geometry finds two rooms, and one of them
is the room the file names, it takes the other as well. If geometry doesn't
find the file's room, nothing is added. Before and after, on every row and
room in the 25 files, exactly those 20 openings changed. So did 17 rooms,
each losing a window's or a door's area from its net wall figure. Nothing
else moved. The window's COBie Space cell now reads `2R02,2D20`: the roof
space and the conference room.

What is still open: whether a handover should list an outside space such as
`2R02 ROOF` in a component's Space cell at all. That depends on the client's
COBie requirements, and a BIM manager would know. The method and every number
are in
[eval/door-extra-room-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/door-extra-room-2026-11-23.md).
