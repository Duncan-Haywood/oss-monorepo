---
title: "ArchiCAD's stored window volume leaves out the glass"
seo_title: "ArchiCAD IFC window Net Volume: frame only, no glass"
date: 2026-11-21
tags: [ifc-quantity-takeoff, ventures, bim, archicad]
description: "On a public ArchiCAD IFC, windows store Net Volume as the frame and sash without the panes, a quarter short. The takeoff now names it and sums the panes."
---

Two identical windows in the same ArchiCAD model, "merk B1", have bodies of
exactly 0.11359 m3. One stores a `Net Volume` of 0.08143 m3, the other
0.07986. Both are about 30% under the geometry, and not by the same amount.
That looks like a figure taken from the wall each window sits in.

It is not. It is the glass.

The model is `schependomlaan.ifc` in the public web-ifc test set. Each
window body is a set of faceted solids, each with a surface style. Nine are
styled "RAL 9001", the white frame and sash. One is styled "Glas - algemeen",
a style rendered 49% see-through. Take that pane's volume off the body and
you get the stored figure to six decimals:

| Window | Body | Pane | Body less pane | Stored |
|---|---:|---:|---:|---:|
| #47471 | 0.113590 | 0.032165 | 0.081425 | 0.081425 |
| #50130 | 0.113590 | 0.033734 | 0.079856 | 0.079856 |

The two windows differ because one has a thicker pane, drawn with one less
frame piece. The bodies add up to the same total. A door with two panes
("merk F-R") does the same: 0.198417 less 2 x 0.028421 is the stored
0.141575. ArchiCAD also writes the same number as `W/D Opening Volume`.

## What the takeoff does with it

The [IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/) compares
each stored volume with the one it computes from the geometry. After the
last round, 83 NetVolumes on 13 public models had no named cause, and 81 of
them were these windows and doors. A new rule finds a window's or door's
glass from the file itself: the items drawn in a style named glass, or
rendered part see-through. When the stored volume equals the body less
those items within 0.5%, the cause is named `glazing-left-out`. The bill of
quantities then sums the whole body.

That covers 77 of the 81, with the worst fit at 0.018%. Unexplained
NetVolumes go from 83 to 6, and nothing on the other 12 models changes. On
this model the windows' total volume goes from 8.46 to 10.26 m3. Before, the
bill had been trusting a figure that left out 2.6 m3 of glass.

Two traps came up along the way, both in this file. ArchiCAD's insulation
style is called "Isolatie - glaswol-steenwol", glass wool, so a plain "glas"
substring test calls it glass. And the "Lucht" (air) style renders at full
transparency. The rule matches whole words only and ignores styles that are
fully invisible.

## Where it stops

Not every ArchiCAD object does this. The "R1 18" windows and most "D2R"
doors store the frame alone. Four "D1R 18" doors with 17% glass store the
whole body. Four "D2R 2zl" doors count the glass in the door leaf and leave
out the glass in the side lights. Testing every subset of a door's panes
would match by chance too often to trust on four doors, so those four stay
unexplained.

All of this comes from one model and one ArchiCAD library. Window volume
rarely matters to an estimate, since windows are counted and measured by
area. But a stored figure a quarter short is wrong wherever someone sums it,
for example a material or embodied-carbon total by volume. The method, the
per-library-part table and every number are in
[`eval/glazing-left-out-2026-11-21.md`](../../ventures/ifc-quantity-takeoff/eval/glazing-left-out-2026-11-21.md).
