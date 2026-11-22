---
title: "A P6 percent-complete field that came back from Microsoft Project as an integer, and the fix"
seo_title: "Keep P6 UDF types through Microsoft Project and back"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "Project has one Number field type, so P6 decimal UDFs holding whole numbers came back as integers. With the original XER, 13,174 of 13,174 keep their type."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) converts a Primavera
P6 `.xer` to Microsoft Project XML and back, in the browser. A common path on
a job: the owner's scheduler sends the XER, a subcontractor edits it in
Project, and it has to go back into P6.

On that trip, every P6 user-defined field (UDF) value already came back with
its title and value. Its **type** did not always. Microsoft Project has one
kind of Number custom field. P6 has two: integer and decimal. A decimal UDF
that happens to hold only whole numbers, such as a percent complete of 0, 50
and 100, lands in a Number field, and on the way back nothing in the Project
file says it was decimal. It came back as an integer UDF. That causes trouble
later: P6 refuses a 37.5 typed into an integer field.

## How often that happens on a real file

On the public 16,000-activity CCA hospital file (P6 6.0), six of its
activity UDFs were like that, holding 6,070 values in all. Four of them are
percent-complete fields (`RENZ % COMPLETE`, `PERCENT COMPLETE`,
`July2011 Target% Complete` and `U%`); the other two are number fields left
with P6's default titles. Measured
against P6's own types, the round trip kept the type on 7,104 of 13,174
values.

## The fix: ask for the file you already have

We could have hidden a marker in the Project file, but there is no Project
seat here to check that Project keeps it when it saves. The person converting
back nearly always has the XER the Project file came from, since it is where
the round trip started. So the converter now takes it as an optional second
file (`--types-from original.xer` on the command line, or the "original XER"
box on the page). Each UDF whose title matches one in that file takes P6's
type from it:

- integer or decimal for a number field, start or finish for a date field
  (this also recovers the eleventh finish-date UDF, which has to sit in one
  of Project's Date fields because Project has only ten Finish fields);
- like for like only: text and cost are never changed, and a title of
  another kind is ignored;
- an integer type is not taken back if someone typed a fraction into the
  column in Project. The field stays decimal and the warning names it.

## Result

| CCA, through Project XML and back | before | with the original XER |
|---|---|---|
| UDF values back, same title and value | 13,174 / 13,174 | 13,174 / 13,174 |
| ... with P6's own type | 7,104 / 13,174 | **13,174 / 13,174** |
| P6 import problems, six public files | 0 | 0 |

The method, the six fields and the limits are in
[`eval/udf-types-from-2026-11-22.md`](../../ventures/xer-schedule-check/eval/udf-types-from-2026-11-22.md).
Two limits: a UDF renamed in Project no longer matches, and the result has
not been imported into P6 itself. It has been checked against the original
file's own types and P6's import rules as the tool encodes them.

The tool is free and MIT licensed, and the file never leaves your browser.
Have a qualified scheduler review anything you submit.
