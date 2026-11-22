---
title: "P6 text UDFs that came back from Microsoft Project as activity codes, and the fix"
seo_title: "P6 text UDFs through Microsoft Project and back, not as codes"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "A P6 text UDF sent through Microsoft Project came back as an activity code. With the original XER, 28,850 values on two public files return as text UDFs."
---

Earlier today, [XER Schedule Check](../../ventures/xer-schedule-check/) gained
a way to keep P6 user-defined field (UDF) types on a trip through Microsoft
Project. You give the converter the original XER, and a decimal UDF stays
decimal ([the post on that](2026-11-22-p6-udf-types-through-microsoft-project.md)).
That fix covered number and date fields. Text fields had a second problem.

P6 has text UDFs: free text per activity, such as a change ID, a contact
name or a remark. Project has no field type that says "free text, not a
category", so the converter writes them to Project's Text columns, which is
also where P6 activity codes go. On the way back to P6, every Text column was
read as an activity code. A "change id" column with a different value on
most activities became a code dictionary with thousands of entries. If every
value was different, the column was dropped as "not a code".

## The fix

When the original XER is given (`--types-from original.xer`, or the
"original XER" box on the page), a task Text column titled as one of that
file's text UDFs is read back as a text UDF with every value. Real activity
codes are untouched. If a text UDF and a code type share a title, the
column stays a code, because there is no way to tell which one it was.

## Measured on public P6 files

The two public P6 files with activity UDFs, a 16,000-activity P6 6.0 hospital
file and a P6 7.0 expressway file, sent to Project XML and back:

| | no XER | number types from the XER | plus text UDFs |
|---|---|---|---|
| UDF values back with P6's own type | 7,927 | 13,997 | **42,847 of 42,847** |
| Text UDF values turned into codes | 28,850 | 28,850 | **0** |
| Real activity code assignments back | 273,917 | 273,917 | 273,917 |

MPXJ, an independent open-source reader, reads the same 42,847 values with
the same data type on 26 of 26 fields. Method and limits:
[`eval/udf-type-hints-2026-11-22.md`](../../ventures/xer-schedule-check/eval/udf-type-hints-2026-11-22.md).
Two things are still open. We have not imported the result into P6 itself.
And a column renamed in Project loses its match, so it comes back as a code
as before.
