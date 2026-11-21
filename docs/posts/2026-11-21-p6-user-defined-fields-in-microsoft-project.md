---
title: "P6 user-defined fields in Microsoft Project: 41,729 values a converter used to drop"
seo_title: "Convert Primavera P6 UDFs to Microsoft Project custom fields"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "XER Schedule Check now writes a P6 file's activity UDFs as named Number, Cost, Date and Text fields in Project XML, checked value by value with MPXJ."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) converts a
Primavera P6 `.xer` export to Microsoft Project XML in the browser, for the
owner's rep, subcontractor or estimator who has Project and no P6 seat. Until
today the conversion dropped every **user-defined field** (UDF) and only said
how many it dropped.

That was the wrong thing to drop. On the largest public P6 file we test with,
a 15,849-activity car park and hospital programme, the scheduler had added 32
activity UDFs and filled in 41,729 values: "Change Order #", "Claimed This
Month", "July2011 Target % Complete", "NEW ACTIVITY ID", two access-date
fields. That is the commercial record of the job, kept beside the logic.
Someone opening the converted file in Project got the bars and lost the
record.

## What happens now

Each activity UDF becomes one of Project's spare custom fields, renamed to
the UDF's title, so it shows up as a column you can group, filter and sort by:

- integer and decimal UDFs go to **Number1..20**
- cost UDFs go to **Cost1..10**
- start and finish date UDFs go to **Date1..10**
- text UDFs go to the **Text** fields that activity codes leave free

Indicator UDFs (P6's traffic lights) have no Project equivalent. They are
listed in the conversion warnings with their counts, not dropped silently.

The field IDs were not typed from memory. They come from MPXJ's field table,
and MPXJ is the open-source library most schedule converters are built on.
We also asked it how a cost field is stored: in hundredths, so 1,234.56 is
written as 123456.

## Twenty-nine text columns, and who gets them

Project has 30 task text fields. Text1 holds the P6 activity ID, which leaves
29. Activity codes already used them, one per code type. The CCA file has 37
code types and 15 text UDFs, so they cannot all fit.

The first rule we tried gave codes priority. On this file it would have
dropped every text UDF, including a "change id" column filled on 15,548
activities, to keep code types filled on only 425. Now codes and text UDFs
share the 29 fields, ranked by how many activities each fills, and a code
type wins a tie. On CCA, 24 code types and 5 text UDFs get a field. 4,287
values do not fit (3,541 code assignments and 746 UDF values), against 29,971
under the codes-first rule. Each field left out is named in the warnings with
its count.

## How it was checked

We converted the six public P6 files and read every XML back two ways: with
this tool's own Project XML reader, and with MPXJ 16.10. No public file has a
cost UDF, so we also added a planted file with two cost fields (one with
negative values), start and finish dates, an integer and a decimal: 124
values.

| | Values written | Read back the same (our reader) | MPXJ, same field and value |
|---|---|---|---|
| CCA (P6 6.0) | 40,983 | 40,983 | 40,983 |
| Expressway (P6 7.0) | 1,864 | 1,864 | 1,864 |
| Planted | 124 | 124 | 124 |

MPXJ also finds all 32 field names where they were meant to go. Nothing else
in the conversion moved: 21,422 of 21,422 activities and 54,843 of 54,843
links still read back unchanged. The full method and limits are in
[`eval/msproject-udfs-2026-11-21.md`](../../ventures/xer-schedule-check/eval/msproject-udfs-2026-11-21.md).
The biggest limit: none of these files has been opened in Microsoft Project
itself.

## It works the other way too

The Project XML reader now turns Number, Cost and Date fields back into UDFs.
So a Microsoft Project schedule that keeps its three-point estimates in
Number fields called "Optimistic Duration" and "Pessimistic Duration" feeds
the tool's Monte Carlo risk run the same way a P6 file's UDFs do. Before,
that worked only for P6 files.

Try it with your own file at
[marisstella.app/xer-schedule-check](https://marisstella.app/xer-schedule-check/).
It runs in your browser and nothing is uploaded. The results are estimates
from the file you give it, not professional scheduling advice.
