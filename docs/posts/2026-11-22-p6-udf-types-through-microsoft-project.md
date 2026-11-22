---
title: "Sending a P6 schedule through Microsoft Project and back without losing its UDF types"
seo_title: "Keep P6 UDF types on a Microsoft Project round trip"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "A P6 file sent through Microsoft Project came back with decimal UDFs as integers and text UDFs as codes. The original XER now restores them."
---

A common job-site loop: the owner's scheduler works in Primavera P6, a
contractor works in Microsoft Project, and the schedule goes back and forth.
[XER Schedule Check](../../ventures/xer-schedule-check/) already converts both
ways in the browser, and every user-defined field (UDF) value came back. But
not always as the same *kind* of field:

- Project has one Number type. A P6 decimal UDF that happened to hold only
  whole numbers (a percent complete of 25, 50, 75) came back as an integer
  UDF.
- Project has no free-text custom field that the converter could tell apart
  from a code column, so every P6 text UDF ("change id", "EAM Contact
  Person") came back as an activity code, a code dictionary with one entry
  per distinct note.

On a public 16,000-activity P6 6.0 file (CCA) that meant 27,809 text values
turned into codes and 6,070 decimal values turned into integers.

## The fix: use the file you already have

We looked for a marker inside the Project file that would survive a save in
Project, but with no Project install here there is no way to test which one
Project keeps. Someone sending a P6 file through Project and back almost
always still has the original XER, though. So the converter now takes it
as a hint: `--udf-types-from original.xer` on the command line, or an
optional file box under "Download for Primavera P6" on the page. Each field
titled as one of the original's UDFs gets that UDF's type back. There are
guards: an integer hint applies only when every value is a whole number,
and a date hint on a number field is ignored. Nothing is uploaded.

## How it measured

On the two public P6 files that carry activity UDFs, sent to Project XML and
back:

| | before | with the original XER |
|---|---|---|
| UDF values back with P6's own type | 7,927 of 42,847 | 42,847 of 42,847 |
| Text UDF values turned into activity codes | 28,850 | 0 |
| Real activity code assignments back | 273,917 | 273,917 |
| P6 import problems | 0 | 0 |

MPXJ, an independent open-source reader of both formats, reads the same
42,847 values and the same data type on 26 of 26 fields (12 of 18 before).
The method and the limits are in
[`eval/udf-type-hints-2026-11-22.md`](../../ventures/xer-schedule-check/eval/udf-type-hints-2026-11-22.md).
Not yet tested: an import into P6 itself (we have no seat), and a UDF
renamed in Project, which loses its hint and falls back to the old guess.
