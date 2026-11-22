---
title: "P6 finish-date fields now survive a trip through Microsoft Project"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "XER Schedule Check now puts P6 finish-date UDFs in Project's Finish fields and reads Start and Finish fields back: 120 of 120 values, up from 0."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) converts Primavera P6
`.xer` files to Microsoft Project XML and back, in the browser. Schedulers use
P6 *user-defined fields* (UDFs) for things like access dates, permit expiry
dates and "must be done by" dates for a trade. P6 has two kinds of date UDF,
start dates and finish dates. Microsoft Project has three sets of custom date
fields: Date1-10, Start1-10 and Finish1-10.

Until today the converter put both P6 kinds into Project's Date fields. The
values went across, but a finish date came back to P6 as a start date. Going
the other way was worse: anything a Project user kept in Start1-10 or
Finish1-10 was dropped on the way to P6, with no warning.

**What changed.** Finish-date UDFs now go to Project's Finish1-10 fields
(activity, WBS and resource). Start-date UDFs stay in Date1-10. On the way
back, Start fields become start-date UDFs and Finish fields become finish-date
UDFs.

**How it was checked.** The open-source MPXJ project publishes Project XML
files saved by Microsoft Project 2003, 2007, 2010, 2013, 2016 and 2019, each
with every Start and Finish field set on a task named after it. The field
IDs Project wrote in those files match the ones the converter uses, all 20 of
them. Through XML, to XER and back to XML:

| | before | now |
|---|---|---|
| Project Start/Finish values carried to P6 with the right kind | 0 of 120 | 120 of 120 |
| ...and back in a Project field of the same kind | 0 of 120 | 120 of 120 |
| A public P6 6.0 file's finish-date values back as finish dates | 0 of 182 | 182 of 182 |

Nothing else in the round trip moved: same links, codes, schedule and UDF
values on six public P6 files, and no P6 import problems.

**What it does not do yet.** Project has one Number type and P6 has integer
and decimal. A decimal P6 field that holds only whole numbers still comes back
as an integer field. The values are the same, but the type is not. And
nothing here was opened in a real copy of P6 or Project: the checks use the
files Project saved and MPXJ's reader.

The full measurement is in
[`eval/finish-udfs-2026-11-22.md`](../../ventures/xer-schedule-check/eval/finish-udfs-2026-11-22.md).
The tool is free and MIT licensed. It is a schedule-checking aid, not
professional scheduling or legal advice: check results against your own
scheduling software before relying on them.
