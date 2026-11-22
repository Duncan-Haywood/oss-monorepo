---
title: "Comparing IFC revisions: when 13 added windows are really 2 swaps and 9 re-placements"
seo_title: "IFC revision comparison: windows replaced in place"
date: 2026-11-22
tags: [ifc-quantity-takeoff, ventures]
description: "A designer who deletes a window and places another in the same opening gives it a new GlobalId and a new Revit id. The free change report now pairs them."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) compares
two issues of a building model and lists what changed: every bill-of-quantities
line, and every element added, removed, changed, moved or resized. It pairs
elements across the two files by GlobalId, then by the Revit element id Revit
writes in the Tag, then by place and volume, so an export that renews
GlobalIds does not make the whole building look demolished and rebuilt
([how it was checked on two houses](https://marisstella.app/ifc-quantity-takeoff/how-to-compare-two-ifc-revisions-for-a-change-order.html)).

Today's run went back to one of those houses, OpeningDesign's Lake Kegonsa
Home, and listed every commit in its repository that touches an IFC file.
Two exports the first pass had missed turned up: the earliest model from
July 2014, and one from 21 October 2014, two days before the next. That
two-day step is the cleanest in the series: one exporter version on both
sides, four in five matched elements unchanged, nothing reclassified. It
also made a fault in the report plain to see.

## 12 removed, 13 added

Between 21 and 23 October the report listed 12 windows removed and 13 added.
Every one had a new GlobalId *and* a new Revit id, so neither key could pair
them. Drawn side by side, the boxes told the story:

- five casements of one size, same type and volume, each 22 mm lower;
- four first-floor windows of the same types, each 64 mm further out in a
  deeper frame;
- two 33-5/8" x 48-7/8" double-hungs replaced, in the same openings, by
  31-1/2" x 48" casements;
- one window whose replacement went a metre along the wall, and one genuinely
  new window.

An estimator reading "13 added" would price 13 windows. The change is two
swapped for another size and nine moved a few centimetres.

## Replaced in place

The comparison now has one more pairing, run last on whatever is still
unpaired: same class, same storey, boxes overlapping by at least half their
union, volumes within a quarter, exactly one candidate each way, and no
second unpaired element of that class centred in either box (which is what a
host wall and its layers look like). A pair is listed as **replaced in
place**, always as a change, with the type it replaced, how far it moved and
whether it changed size.

Across the house's seven exports that pairs 92 elements (184 records that
were listed as removed or added): 39 windows and a door, 26 walls redrawn
(14-inch foundation walls swapped for 12-inch, "Exterior Wall-New" for
"Exterior Wall-2x6"), 18 curtain-wall mullions regenerated, and a few
footings and fittings. On the controls nothing moved: three test pairs
with one known edit each got no new pair, and a second house's five
exports paired one duct and left its walls and their parts exactly as before.

## What it does not settle

The thresholds were set on one house and checked on two more. A window moved
a metre is still "removed and added", on purpose: whether that is the same
window is a judgement a bounding box cannot make. Nobody who prices change
orders has yet told us whether "replaced in place" is the line they want.
The method, every pair and the seeded-fault tests are in the
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/replaced-in-place-2026-11-22.md).

Both files are read in your browser tab; nothing is uploaded. Results are
estimates to check, not professional advice.
