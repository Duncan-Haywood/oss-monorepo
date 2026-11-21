---
title: "A window taller than the room: net wall finish cut at the ceiling"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, estimating]
description: "IFC Quantity Takeoff now takes off only the part of a window below a room's lowered ceiling. On a school model that was 21% too much per window."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) gives every
room in a model its wall area: the perimeter times the room's height, with
the doors and windows in its walls taken off. A painter or plasterer prices
that net figure. Since this morning it has had one quiet error. The gross
figure stops at the room's ceiling, but each door and window came off at its
full stored size, even when it ran past the ceiling.

## Where it happens

A school model in the public test set has classrooms with a ceiling lowered
to 2.44 m and a fixed window wall 3.09 m tall, floor to well above the
ceiling. The space over the ceiling is a void the painter never sees, and
the room's wall area never counted it. Taking the whole window off subtracted
0.66 m of height that was never there: 21% too much for each such window,
60 deductions and 38 m² on that one model.

So now each opening comes off only for the part of its height inside the
room's floor-to-ceiling band.

## The first try cut the wrong doors

The obvious version scales the opening by how much of its body's box sits in
the band. It also cut doors that were fine. Door frames often run on down
into the floor build-up: one office model stores its escape doors as
1.01 x 2.25 m, while their frames are 2.40 m tall and start 15 cm under the
finished floor. The 2.25 m is the clear opening above the floor, and none of
it is outside the room. Scaling the box shaved 6% off each of them.

The fix is to read the stored height down from the head, where the body and
the stored size agree, and to cut only what of that lies outside the band.
Across all 12 models that took the cut from 299 deductions to 151, and from
57.5 m² to 47.2 m². Another model's 25 doors, whose frames dip 1 to 5 cm
under the floor, are no longer touched.

## How much it matters

Over 989 rooms it moves the net wall finish by 0.08%. In the rooms it
touches it is larger: on the school model each cut deduction had taken off
0.64 m² of wall on average that the room's height never measured. The room schedule's CSV now says, room by
room, how much door and window area lay past the floor or ceiling and was
left on.

One case is not explained. In a house model with no space boundaries,
three openings start half a metre below the floor of the room they were
placed in. Either the room sits on a raised floor or the test that finds a
room on each side of an opening picked the wrong one. That needs a look at
the model, and the [write-up](../../ventures/ifc-quantity-takeoff/eval/opening-height-cut-2026-11-21.md)
lists it with the rest of what is left. No estimator has checked these
figures yet.
