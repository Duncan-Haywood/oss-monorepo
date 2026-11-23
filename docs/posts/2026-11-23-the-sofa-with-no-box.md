---
title: "The sofa with no box: placing COBie components by the point they were put down at"
seo_title: "Putting body-less IFC components in rooms for COBie"
date: 2026-11-23
tags: [ids-model-check, ifc-quantity-takeoff, ventures, bim, cobie]
description: "174 Revit components had no box, so the COBie export left their room blank. Their placement point puts 133 of 139 in the room the file names."
---

[IDS Model Check](https://marisstella.app/ids-model-check/cobie.html) writes a
COBie handover workbook from an IFC model. COBie wants each component in a
room, and Revit leaves most equipment on a storey instead, so the tool works
out the room from the geometry: it takes the middle of the component's box
and asks which room's solid holds it.

This morning's check hid the room each component's file names, placed the
components from geometry, and compared. 203 of 1,227 came back blank. 174 of
those had no box at all.

## Why a sofa has no box

They are not broken. Revit writes sofas, grab bars, sinks and towel
dispensers as faceted surface models. Our quantity reader turns those into a
volume, which is all a quantity takeoff needs, but keeps no faces. With no
faces there is no box, and with no box the room test skipped the component.

Every IFC element also has a placement, though: the point the modeller
put it down at. For a Revit family that is its insertion point, usually on
the floor under the object.

## The point instead of the box

The room test now falls back to that point. It looks 10 cm above it first,
because furniture stands on the floor that the room starts at. Then it looks
10 cm below, for things fixed to a ceiling, and then at the point itself.

On the same 25 public models:

| components placed (of 1,227) | before | after |
| --- | --- | --- |
| in the room the file names | 935 | 1,068 |
| in another room | 89 | 95 |
| blank | 203 | 64 |

139 components were placed by their point, and 133 of them got the room the
file names. All 16 sofas and armchairs in the Duplex model are now in their
rooms.

## The 35 on the wall

The ones still blank are almost all on walls: towel dispensers, grab bars,
paper holders. Their insertion point is on the wall face, which is exactly
where the room stops, or 9 cm behind it when the dispenser is recessed.

We tried stepping 20 cm off the wall along the family's own axis. It placed
3 more one way. The other way it put 2 in the room behind the wall, so we
dropped it. A blank cell is better than a wrong room: the QC names a blank,
and a wrong room passes it. Next time we'll ask the host wall which side it
faces.

The numbers and how to rerun them are in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/cobie-placement-point-2026-11-23.md).
The same change puts body-less elements in rooms in
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) too.
Both tools run in the browser tab and are MIT licensed.
