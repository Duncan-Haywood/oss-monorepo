---
title: "Leaving small voids in: a measurement rule for an IFC bill of quantities"
seo_title: "Small voids not deducted: an IFC takeoff rule"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff can now leave small openings in, as measurement rules do. 2,252 openings cut on 12 public models; 1,099 of 1,136 matched width x height."
---

A building model's net wall area has every opening taken out, down to the
smallest pipe sleeve. A quantity surveyor's bill doesn't work that way. Most
written methods of measurement leave small voids in: a hole under some size
isn't deducted from the plaster or the blockwork. A takeoff that sums the
model's net figures therefore disagrees with the measured bill on every
wall with a duct sleeve in it.

The free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
now has an "Openings" control under the bill of quantities. You can deduct every
opening (as modelled), leave in voids up to 0.50 m² of area and 0.05 m³ of
volume, or set your own thresholds. On the command line it's
`node cli.mjs model.ifc --voids-up-to 0.5,0.05`. Thresholds vary by standard,
edition and work section, so the tool doesn't claim any standard's rules.
You type the numbers your contract's method gives.

## Measuring each opening on its own

To leave an opening in, you need to know what that opening alone takes out.
The takeoff already subtracted every opening from each element's body
exactly. Now it also subtracts each one separately, and records the volume it
removes and the area it removes from the section the bill measures (a wall's
middle plane, a slab's plan). A net figure gets the small openings added
back. A gross figure, one the geometry check confirms still has its openings
in, gets only the large ones taken out. A figure whose basis is unknown is
used as it stands, and the row says why.

Adding an opening back is exact only if the openings don't overlap. So the
rule checks that the separate deductions sum to what all the openings take
out together. In 993 of 1,003 elements they did. The other 10 were all in one
Norwegian school model, where overlapping openings meant the rule couldn't
tell what to add back. Those elements stay as modelled and get counted on
their bill line.

## Checked against what the exporters stored

Some exporters store each opening's own width and height. For openings
through walls, we compared the area cut for each opening with width × height:
**1,099 of 1,136 agree within 2%**, across 12 public models from Revit,
ArchiCAD and others. Two of the misses are round windows in AC20-FZK-Haus. The
cut gives 0.785 m² against a 1 × 1 m box. That's π/4, so the cut is the
right figure. 31 more are openings in that school model that barely touch
the wall that names them as host, 0.01 to 0.06 m² cut against about 3 m².
Those are still open.

## How much it moves a bill

Not much at the building level, but it falls on the lines priced per square
metre. Of 2,252 openings, 216 (9.6%) are at or under 0.50 m². At that
threshold the wall and slab area moves by less than a quarter of a percent
per model (+10.6 m² on the dental clinic, +7.2 m² on the HHS office, almost
all of it in slabs). At 1.00 m² it moves up to 1.41% on OpeningDesign's
Schultz Residence, where the walls alone go up 2.35%. The method and every
number are in
[eval/measure-rules-2026-11-20.md](../../ventures/ifc-quantity-takeoff/eval/measure-rules-2026-11-20.md).

One older claim turned out to be wrong. The README said overlapping openings
in one element were subtracted twice. A test with two overlapping openings in
a 10 m wall gives exactly the 24 m³ the union leaves, so they're taken out
once, and the README now says so.

Next: different thresholds per class or work section, and mapping
classification codes to Uniformat and MasterFormat elements, the other half of
a method-of-measurement layer.
