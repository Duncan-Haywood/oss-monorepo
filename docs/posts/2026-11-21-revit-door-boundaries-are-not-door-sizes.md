---
title: "Net wall finish per room from IFC: Revit's door boundaries are not door sizes"
seo_title: "Net wall finish per room from IFC space boundaries"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, estimating]
description: "IFC Quantity Takeoff now takes doors, windows and curtain walls off each room's wall area. Revit's boundary surfaces would have overstated door area 23%."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) already gave
every room a gross wall area: perimeter times height. A painter or plasterer
prices the net figure, with the doors, windows and glazed walls taken off. As
of today the room schedule carries both, and the page and CSV say how many
openings came off each room and how they were found.

## Two ways to know which door is in which room

The IFC schema has a relationship for this, `IfcRelSpaceBoundary`. It says
which wall, door or window bounds which room, with a surface for each. Nine
of the twelve public models with rooms that I tested carry boundaries. The
other three (a Norwegian school with 576 doors and windows, a German flat and
a small house) do not.

For those, the takeoff looks either side of each door or window. It takes the
middle of the opening's body and moves it out through the wall, by half the
opening's depth plus 20 cm each way (60 cm if that lands nowhere), then asks
which room's solid holds each point. A door between two rooms comes off in
both, because both sides get painted.

To see how far to trust that, I ran it on the nine models that do have
boundaries, as if they didn't, and compared. For 791 of 857 openings it found
exactly the rooms the file names. For 37 it found some of them and nothing
wrong, and for 10 it found none. It named a room the file doesn't for 19.
Seventeen of those are windows in one dental clinic model where the file names
only a space called "ROOF" and the geometry also finds the office on the
other side. The other two are doors between two rooms that the file lists on
one side only. I'm not sure the geometry is the one that's wrong.

## The surprise: boundary surfaces are not opening sizes

The obvious way to size each deduction is the boundary's own surface. That
works for ArchiCAD-style exports: on two of them, 375 of 378 door and window
boundaries match the opening's stored width times height within 2%.

It fails on Revit. Revit writes a door's boundary as the door frame's width
swept up the full height of the room. On the Office_A model every door
boundary is exactly 1.366 times the door: a 1.067 m frame times a 2.5 m room
height, for a 0.915 by 2.134 m door. Across three Revit exports, 0 of 705
boundaries matched. Using the surfaces took 618.9 m² of doors off Office_A.
Using the stored sizes took 486.6 m², so the surfaces would have overstated
door area by 23% and understated the paint.

So a door or window comes off at its stored `OverallWidth × OverallHeight`,
and the boundary surface is only a fallback. Curtain walls are the exception:
Revit's curtain walls have no body of their own, and their boundary surface
(the glazed strip over the room's height) is what should come off. On the
dental clinic that's 352 m².

## One window, three IfcWindows

One Dutch housing model draws each window as the window, its sub-frame and
the sub-frame's sill, each a separate `IfcWindow`. Counted naively, every
window comes off three times. Now, in each room, a piece whose box sits
mostly inside a larger piece's isn't taken again. That removed 229 duplicate
deductions on that model.

## What it adds up to

Across 989 rooms in 12 models: 65,368 m² of gross wall, 6,914 m² of doors and
windows off (10.6%) and 352 m² of curtain wall. 1,330 deductions came from the
files' boundaries and 1,419 from geometry. The method, the per-model tables
and what isn't done (an opening above a lowered ceiling still comes off in
full, reveals aren't added back) are in
[eval/net-wall-finish-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/net-wall-finish-2026-11-21.md).
No estimator has checked these figures yet.
