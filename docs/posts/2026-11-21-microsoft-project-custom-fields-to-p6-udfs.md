---
title: "Microsoft Project custom fields to P6 user-defined fields, value by value"
seo_title: "Convert Microsoft Project custom fields to Primavera P6 UDFs"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "XER Schedule Check's Project-to-P6 converter now writes Number, Cost and Date columns as named P6 UDFs: 14,240 of 14,240 values read back the same in MPXJ."
---

A planner who runs the job in Microsoft Project is often told to hand over a
Primavera P6 `.xer`. The owner or general contractor runs P6, and their
contract says so. [XER Schedule Check](../../ventures/xer-schedule-check/)
writes that XER from the Project XML in a browser tab. Until today it carried
the plan (WBS, logic, calendars, progress, baseline, resources and costs,
text columns as activity codes) but dropped every **Number, Cost and Date
column**, and only said how many it dropped.

Those columns are where planners keep the numbers that are not dates: crew
size, a provisional-sum allowance, the amount claimed this month, an access
date promised by the owner. Dropping them meant retyping them in P6, or not
sending them.

## What happens now

Each Number, Cost and Date column a file uses becomes a P6 **activity
user-defined field** (UDF), titled after the column's name in Project (or
Number3, Cost1 when it has none), so it shows as a column in P6 after the
import:

- a Number column of whole numbers becomes an integer UDF, any other Number
  column a decimal one
- a Cost column becomes a cost UDF (Project stores hundredths; P6 gets the amount)
- a Date column becomes a start-date UDF

Two columns with the same title get " (2)", because P6 refuses a repeated UDF
title. The tables are written in the order P6 writes them, with the eight
fields P6 6.0 to 24.12 all use. The converter's import check now covers them
too: every value points at a real activity and UDF, one value per activity,
numbers where P6 expects numbers.

## How we checked it

No P6 seat here, so the checks use what stands in for one: P6's own field
lists from public P6 exports, this tool's XER reader, and
[MPXJ](https://github.com/joniles/mpxj), the open-source reader most schedule
converters use.

- **Every custom field Project has.** MPXJ's test files include Project
  2003, 2007, 2010, 2013, 2016 and 2019 saves with every Number1..20,
  Cost1..10 and Date1..10 field filled: 243 values in 19 files. All 243 come
  back as UDF values on the right activity with the right title and value.
- **A P6 schedule sent through Project and back.** The converter the other
  way already writes a P6 file's UDFs to Project's columns. On the largest
  public P6 file we test with (a 15,849-activity programme with 32 UDFs),
  13,174 of 13,174 numeric, cost and date values return to P6 unchanged; on a
  P6 7.0 expressway job, 823 of 823.
- **An independent reader.** MPXJ reads the same 14,240 of 14,240 values
  from the Project file and from the XER written from it.

## What it does not do yet

- **The UDF's type on a round trip.** Project has one kind of Number column,
  so the type is guessed: whole numbers make an integer UDF. On the big P6
  file six decimal UDFs hold only whole numbers ("PERCENT COMPLETE" and
  similar) and come back as integer UDFs. The values are the same, but 7,104
  of 13,174 keep P6's own type. Always choosing decimal would be just as wrong:
  the same two files have six real integer UDFs.
- **Finish-date UDFs** come back as start-date UDFs; Project has one date kind.
- **Text columns** still become activity codes, not text UDFs.
- It has not been imported into P6 itself.

The full measurement, with the commands to rerun it, is in
[`eval/p6xer-udfs-2026-11-21.md`](../../ventures/xer-schedule-check/eval/p6xer-udfs-2026-11-21.md).
The tool is free and MIT licensed, and nothing is uploaded:
[marisstella.app/xer-schedule-check](https://marisstella.app/xer-schedule-check/).
