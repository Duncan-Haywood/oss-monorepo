---
title: "We ran Excel2IDS on 321 workbooks: what reading its source missed"
seo_title: "Excel2IDS run on 321 workbooks: what reading the source missed"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "Running Excel2IDS's own tool confirmed the predicted differences and found two more: a version called None and _x000D_ in IDS files. It found a bug of ours too."
---

Earlier today, [IDS Model Check](https://marisstella.app/ids-model-check/)
started telling you, cell by cell, where buildingSMART-community's
[Excel2IDS](https://github.com/buildingsmart-community/Excel2IDS) tool would
turn your workbook into a different IDS than our reader does. Those rules came
from reading the tool's Python source. Two sessions in a row couldn't run the
tool itself, so nobody had checked the rules against it.

This run did. It imported the tool's script unchanged (ifctester 0.9.0,
openpyxl 3.1.5) and fed it the 321 workbooks the checker writes from public
IDS files, IDS-Audit-tool's test files and buildingSMART's test pairs. Then it
compared each IDS the tool wrote with ours, specification by specification.

## What held

- **No stops.** The tool read all 321 workbooks. Before this morning's fix,
  which fills an empty purpose with `General`, the rules said it would stop on
  316 of 351.
- **`<milestone>LOD400</milestone>`** was in every file, as predicted. It's a
  placeholder in the tool's code.
- **IFC version.** 235 specifications differ only because a workbook names
  several versions (`IFC4 IFC4X3_ADD2`) and the tool keeps just
  `IFC4X3_ADD2`.
- **A typed `TRUE`** in the template's own sample came out as
  `<simpleValue>True</simpleValue>`. That isn't an IDS boolean, so the
  sample's "External doors" category matches no door.

## What reading the source missed

**A version called "None".** 311 of the 321 files say
`<version>None</version>`. The tool passes the version cell through Python's
`str()`, and an empty cell becomes the word "None". The file is still valid
against ids.xsd, so no validator flags it.

**`_x000D_` inside the IDS.** Excel stores a carriage return in cell text as
the escape `_x000D_`. openpyxl, which the tool uses to read the workbook,
doesn't undo that escape, so the tool copies it into the IDS as-is. In our
corpus that happened to 88 instructions in two files. It will happen to any
workbook where someone pasted text with Windows line endings into a cell.

The checker's list of tool differences now names both, with the cell. The Read
me sheet in our workbook download mentions them too.

## And a bug of ours

The reader that turns workbooks into IDS had a fault the tool didn't. A
category whose applicability has both a property and an attribute was written
in the template's column order, property first. ids.xsd requires
entity, partOf, classification, attribute, property, material, in that order.
One public set, VDCbase's "9.13 Buitenruimte", came out invalid. Every
spreadsheet path (CSV, `.xlsx` and Excel2IDS) now writes applicability facets
in the schema's order. All 323 files our reader produced are now valid against
ids.xsd, and the round trip of 309 public specifications is unchanged.

## Try it

Drop a filled Excel2IDS workbook on the
[checker](https://marisstella.app/ids-model-check/). You'll get one IDS per
purpose and a folded list of the cells where the Windows tool would write
something else. The full measurement, including the commands to rerun it, is
in the venture's
[`eval/excel2ids-sidebyside-2026-11-19.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/excel2ids-sidebyside-2026-11-19.md).

This is a free tool, not professional advice. Check the IDS you hand over.
