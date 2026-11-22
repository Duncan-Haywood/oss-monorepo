---
title: "A bar bending schedule from the bars themselves, checked against Tekla's own"
seo_title: "Bar bending schedule from IFC, checked against Tekla"
date: 2026-11-22
tags: [ifc-quantity-takeoff, construction, rebar, evaluation]
description: "Our free IFC takeoff now reads each rebar's path into a schedule by bar mark. On real Tekla files the counts and weights match Tekla's own."
---

[ifc-quantity-takeoff](../../ventures/ifc-quantity-takeoff/README.md) is a free, in-browser quantity takeoff for IFC building models. Until today it summed reinforcing bars into the bill of quantities by class and type. Nobody buys rebar that way. A fabricator works from a bar bending schedule: for each bar mark, the size, how many bars, the cut length of each, the shape with its leg dimensions, and the mass. So the takeoff now builds that schedule from the bars' own geometry. We then checked it against the schedules that Tekla and Allplan write onto the same bars. The full working is in [eval/rebar-schedule-2026-11-22.md](../../ventures/ifc-quantity-takeoff/eval/rebar-schedule-2026-11-22.md).

## The bars main could not read

We searched GitHub for public IFC files that contain `IFCREINFORCINGBAR` and kept the 12 that are real exports. Among them were two Tekla Structures 2025 models of an Argentine plant's concrete, an Allplan crane foundation, Revit, FreeCAD, and buildingSMART's samples. Together they hold 310 bar elements. The released takeoff read 35 of them, all from buildingSMART's two samples.

The cause was one line. Every Tekla, Allplan and Revit bar sets the swept disk's StartParam and EndParam, and the reader refused any bar that set them. Each tool also means something different by them:

- **Tekla** writes 0 and the whole parameter range of the bar's curve: each straight leg counted by its length, each bend by its angle in radians.
- **Allplan** writes 0 to 1 on a curve of 37 pieces. Read as parameters, that would cut the bar off after its first facet. It means the whole bar.
- **Revit** gives its arcs' range in degrees. One file instead wrote 3,500 on a 6,096 mm line for a bar that is 3,500 mm long, so that number was a length.

The reader now handles all three. It also reads Tekla's vertical legs, which an older routine measured in plan view, where a leg running straight down has no length. The result: 265 of 310 bar elements read. The other 45 are drawn as meshes or a brep, with no path to read, and the schedule lists them.

## What matched

Tekla writes its own figures on every bar group: the mark, the shape, the number of bars, the leg dimensions and the group's weight. Allplan writes the position number, the bars in the whole position, the mass per metre and the bending diameter. Against those:

| Figure | Agree |
|---|---|
| Bars in a Tekla group | 32 of 32 |
| Bars in an Allplan position | 24 of 24 |
| Tekla group weight, within 1% | 32 of 32 |
| Allplan bending diameter against the bends drawn | 13 of 13 |
| Leg dimensions, within 2 mm | 30 of 33 |

## Three things we learned on the way

**Tekla draws a 10 mm bar 10.625 mm across.** The extra width is the ribs, and the IFC attribute says 10.625 too. Weigh that disk at 7,850 kg/m³ and every Tekla bar comes out 13% heavy. Tekla's own weight is the bar's centreline length times the 10 mm bar's 0.617 kg/m. Mark 21 has 16 bars of 4,802 mm: 47.37 kg by that rule, against Tekla's 47.40. The takeoff now weighs a bar by the nominal size its properties name. The bill of quantities uses the same rule. One sample went further and drew 16 mm bars 32 mm across, with the radius written where the diameter belongs. By volume that would be four times the steel.

**Tekla's DIM_L is not the cut length.** It is the leg dimensions added up and rounded down to 10 mm. For example, 328 + 2,250 + 328 = 2,906 gives a DIM_L of 2,900. That holds on 26 of the 27 Tekla lines that carry a DIM_L. The schedule's length per bar is the centreline length, bends included. That is the steel that gets cut, and Tekla's own weights use it.

**Allplan draws a bend as eight facets.** Their total length divided by the angle of the turn gives a radius 7% too small. So the reader takes the circle through the facets' corners instead, and gets 56.0 mm against Allplan's stated 56 mm bending diameter. Two FreeCAD files label the bend's inside radius as its "Bending diameter". Both readings are in the report, because the file alone cannot say which one the bending shop would use.

## What it does not do yet

It gives a BS 8666 shape code only for the three shapes it reads with certainty: 00 straight, 11 for one right-angle bend, 21 for a U. Every other shape gets a plain description, with the file's own code kept beside it. Hook legs are measured to the outside of the bend, while Tekla and Revit give them their own way, so the three leg-dimension misses are all hooks. That is the next step. The schedule is on the [page](https://marisstella.app/ifc-quantity-takeoff/) under "Bar schedule", and on the command line as `node cli.mjs model.ifc --rebar bars.csv`. Your model never leaves the browser.
