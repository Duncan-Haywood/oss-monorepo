---
title: "Turning a Primavera P6 XER into an Excel workbook people can actually filter"
seo_title: "Convert a Primavera P6 XER file to Excel, free, in the browser"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, excel]
description: "XER Schedule Check now writes a P6 XER as an .xlsx with names instead of P6's internal ids, checked on 6.2 million values by a separate reader."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser. As of today it also writes the file as an
**Excel workbook**. This is the most common thing someone without a P6 seat
wants from an XER: a table they can sort, filter and pivot.

## Why you can't just open the XER in Excel

An XER is plain text, so Excel opens it, but what you get is hard to use.
The file is P6's database dumped table by table (PROJECT, CALENDAR, PROJWBS,
TASK, TASKPRED, TASKRSRC, ACTVCODE, UDFVALUE and more), stacked one after
another, each row tagged `%R`. Every link between tables is an internal number. A
relationship row says task 4183 follows task 4177. An activity's WBS is
`wbs_id` 23,051. Its responsibility code is a row in a third table pointing at
a fourth. Durations and float are in hours.

## What the workbook does instead

Every internal id becomes the name P6 shows:

- **Activities**, one row each: the WBS path (`INT.L1`), activity ID and name,
  type, status, calendar, durations and float **in days of that activity's
  own calendar**, start and finish, actual, early, late and planned dates as
  real Excel dates, constraints, and predecessors and successors written the
  way a scheduler says them (`A1010 FS+2d`). There is one column per activity
  code type and one per activity user-defined field, so "show me the drywall
  sub's work on level 2" becomes two filter clicks.
- The tool's **recomputed dates and float** sit beside P6's, with a *Float
  Agrees* column. A "no" there usually means someone edited a duration, lag
  or link after P6 last scheduled the file.
- Sheets for **relationships**, **WBS**, **resources**, **assignments** (units
  and cost: budgeted, actual, remaining, at completion), **expenses**,
  **calendars** and **activity code values**. A tick box adds every raw XER
  table as its own sheet for people who want P6's field names.

It has no dependencies. The .xlsx is written in the page (a small zip
writer, compressed with the browser's own `CompressionStream`) and saved
straight to disk. Nothing is uploaded.

## How we know it's right

A converter that silently shifts a date by a day is worse than none. So the
check is a **separate reader in Python** that shares no code with the tool. It
parses each XER itself, opens the workbook with openpyxl, and compares cell by
cell: stored dates to the minute, durations and float to 0.005 day, every code
and UDF value, every relationship and assignment, and every raw table cell.

On six public P6 files (P6 5.0 to 24.12, 21,758 activities, 56,666
relationships), **6,239,763 of 6,239,763 values matched**. The first run did
flag differences, but every one was a bug in the *checker*. Python rounds
33.625 to 33.62 where JavaScript gives 33.63. Python's Windows-1252 decoder
replaced five unassigned bytes that browsers keep. And it split P6 Web's quoted
multi-line calendar data into separate lines. Checkers need checking too.

The Float Agrees column says "yes" on 14,268 of 14,270 open activities of a
16,000-activity hospital schedule. The two that disagree sit behind a lag
someone lengthened after P6's last run.

## What's not done

Nobody has opened one in desktop Excel yet; there is no Excel in the build
environment. openpyxl, which is strict about the package format, reads every
workbook with no warnings. If you open one and something looks off, the source
and the checker are in the repository
(`ventures/xer-schedule-check/excel.mjs`, `eval/excel-check.py`).

Guide: [How to convert a Primavera P6 XER file to Excel](https://marisstella.app/xer-schedule-check/how-to-convert-an-xer-file-to-excel.html).
