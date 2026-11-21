---
title: "P6 WBS user-defined fields in Microsoft Project: where a cost code goes when the WBS becomes summary tasks"
seo_title: "P6 WBS user-defined fields to Microsoft Project XML, free"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "XER Schedule Check now carries P6 WBS UDFs onto Project's summary tasks and back, sharing a column with a same-named activity field. 6,383 of 6,383 values."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) converts a Primavera
P6 `.xer` export to Microsoft Project XML in the browser, and converts a
Project file back to an XER. Activity and resource user-defined fields
already made the trip. Fields hung on the **WBS** did not. A cost code, a
budget, a work package number or a handover date on a WBS node was dropped
without a word.

## Where they go

In P6 a WBS node is its own kind of record, with its own UDFs. In Project it
becomes a summary task, and Project's custom fields (Number1..20, Cost1..10,
Date1..10, Text1..30) belong to every task, summary or not. So the WBS UDFs
now go into the task fields the activity UDFs left free. Each field is renamed
to the UDF's title, so the column in Project reads "Cost code" or "Handover".

A choice came up along the way. P6 keeps activity UDFs and WBS UDFs apart, so
a company can have a "Package" field on both. Project has only one set of
task columns. Two columns that both say "Package" would be confusing, so when
a WBS UDF has the same title and kind as an activity UDF, it writes into that
activity field. Summary rows and task rows then share one column. On the way
back, values on summary tasks become the WBS UDF and values on tasks become
the activity UDF, and P6 gets both again.

## How it was checked

None of the six public XER files the tool is tested on has a WBS UDF, so
eight were planted on three of them: text, cost (some negative), decimal,
integer, start and finish dates, two titled like an existing activity UDF,
and one value on the project node, which has no summary task. Each file went
to Project XML and back to an XER:

- 6,383 of 6,383 values in the fields written came back the same, on the same
  WBS node;
- MPXJ, an independent open-source reader, read all 6,383 cells from the XML
  and from the XER that came back, and 20 of 20 field names;
- 13,997 of 13,997 activity UDF values still came back, so the shared columns
  moved no value from a task to a WBS node or the other way;
- the six files without WBS UDFs convert byte for byte as they did before.

Two limits showed up. On the largest file (14,270 activities), activity codes
and text UDFs already fill all 29 spare Text fields, so the two text WBS UDFs
had no room. The warnings name them and their value counts, and nothing is
dropped without a mention. And Project has one kind of date field, so a P6
finish-date UDF comes back as a start-date one with the same dates.

Full method and tables: `ventures/xer-schedule-check/eval/wbs-udfs-2026-11-21.md`.
None of this has been opened in Microsoft Project or imported into P6 itself.
MPXJ stands in for both. A real XER with WBS UDFs is the next input worth
having.

*XER Schedule Check is free and open source (MIT) and runs in your browser.
Its results are checks and estimates, not professional scheduling, legal or
contractual advice.*
