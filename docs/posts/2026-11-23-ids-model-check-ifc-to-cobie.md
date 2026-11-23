---
title: "IFC to COBie in a browser tab, and the 38 doors nobody put in a room"
seo_title: "Free IFC to COBie 2.4 converter and COBie QC checker"
date: 2026-11-23
tags: [ids-model-check, ventures, bim, cobie]
description: "IDS Model Check now writes a COBie 2.4 handover workbook from any IFC model, places components in rooms from geometry, and checks any COBie workbook."
---

At handover, an owner asks for COBie: one spreadsheet listing the building's
floors, rooms, the kinds of product installed, each installed unit, and who
wrote all of it. US federal owners and UK public projects require it. The FM
team that receives it checks it, and sends it back when required cells are
blank or a component sits in a room that does not exist.

[IDS Model Check](https://marisstella.app/ids-model-check/cobie.html) now
writes that workbook from an IFC model in the browser tab, and checks any
COBie workbook, whichever tool wrote it. Nothing is uploaded.

## The room nobody filled in

COBie wants every component in a space. Revit puts doors, windows and most
equipment on a level instead. In the Duplex model, one of the NBIMS common
BIM files and set up for COBie, 38 of the 99 components sit on a storey and
in no room.

IfcOpenShell's `ifcfm`, the open-source COBie exporter on PyPI, writes `n/a`
in those 38 cells. (Its current `cobie24` preset stops with a `TypeError` on
both public models we tried in version 0.9.0. Its legacy preset works.)

The new export has a "from the geometry" option. It uses
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)'s room
reader to put each component in the room its body stands in. A door or window
gets the rooms on both sides, written `101,102` as COBie allows. All 38 Duplex
components get a room.

Is the room right? The files can answer that. Many exports also write
*space boundaries*: the authoring tool's own record of which rooms a door
connects. We ran the geometry alone on 869 doors and windows that have them,
across 25 public models:

- 791 got exactly the rooms the file names;
- 37 got one of their two rooms;
- 19 got a room the file does not name;
- 22 got none and stayed blank.

For other components we hid the room the file gives and let the geometry
place them. 935 of 1,227 went back to the same room, 89 went to another, and
203 got no room. For 174 of those 203, mostly plumbing and electrical
terminals, the room reader found no solid body to test.

## What the QC catches

The QC runs the checks an owner's review does:

- required cells by stage (design, or handover with manufacturer, warranty
  and serial numbers);
- duplicate keys;
- references to floors, types, rooms or components that do not exist;
- emails, ISO dates, numbers and pick lists.

It also flags a cell that holds its own column name. The Duplex model has
`SerialNumber` typed into the serial number of all 99 components, and the
same for the tag, barcode and dates. Someone filled in a template and never
replaced it, and a check on blank cells alone would pass it.

It also found a problem every one of the 25 files shares: none names an email
in its owner history. COBie keys every row to a contact by email, so every
`CreatedBy` cell is blank. The page now asks for your email and uses it on
rows that have no author.

## Try it

Drop a model at [marisstella.app/ids-model-check/cobie.html](https://marisstella.app/ids-model-check/cobie.html),
or run `node cli.mjs --cobie model.ifc -o handover.xlsx --from-geometry` from
the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check).
`--cobie-qc workbook.xlsx` checks a workbook from Revit's COBie Extension or
anything else. The method and every number are in
[eval/cobie-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/cobie-2026-11-23.md).
It is free, MIT licensed, and not professional advice: your contract's COBie
requirements decide what a deliverable needs.
