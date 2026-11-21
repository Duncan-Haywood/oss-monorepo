---
title: "P6 resource user-defined fields in Microsoft Project, and back: 330 of 330 values"
seo_title: "P6 resource UDFs to Microsoft Project resource fields, free"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "XER Schedule Check now carries P6 resource UDFs into Project's resource Text, Number, Cost and Date fields and back to an XER. 330 of 330 values return."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) converts a Primavera
P6 `.xer` to Microsoft Project XML and back, in the browser. Earlier today it
learned to carry **activity** user-defined fields (UDFs) both ways. Resource
UDFs were still dropped.

They matter for the same reason. A company keeps its own facts about
resources in P6 UDFs: a crew's capacity, whether someone is employed or
contracted, the client sites they are cleared for, a day rate, an induction
date. The one public P6 24.12 file we test on has three on its 29 resources:
`Capacity`, `EmploymentType` and `ClientSite`. Through the old converter, all
87 values were lost.

## What it does now

Microsoft Project has its own set of custom fields for resources, separate
from the task fields: Text1 to Text30, Number1 to Number20, Cost1 to Cost10
and Date1 to Date10 on the resource sheet. Each P6 resource UDF goes into one
of these, and the field is renamed to the UDF's title. In Project you see a
"Capacity" column on the resource sheet, not "Text1".

- Text UDFs use the resource Text fields. On tasks, Text1 holds the activity
  ID and activity codes share the rest. Resources have neither, so all 30 are
  free.
- Integer and decimal UDFs use the Number fields, cost UDFs the Cost fields
  (written in hundredths, as Project stores them), and date UDFs the Date
  fields.
- Indicator (traffic-light) UDFs have no Project equivalent and are counted
  in the warnings.

Going the other way, from a Project XML file to a P6 XER, every resource
custom field the file uses becomes a P6 resource UDF with the field's name.
P6 writes a resource UDF's value with no project id, because resources are
global, and the converter does the same.

We took the field ids from the MPXJ library's own table, not from memory.
Getting one id wrong would put a value in a different column and nothing
would report it.

## How we checked it

Each file goes from XER to Project XML to XER. For every resource UDF value,
the returned file must hold a UDF with the same title and the same value on
the same resource ID. As an independent check, [MPXJ](https://github.com/joniles/mpxj)
reads both the XML and the returned XER.

No public file has a numeric, cost or date resource UDF. So we planted six on
the 24.12 file: two costs (one with negative values), two dates, an integer
and a decimal.

| File | Values | Back the same | MPXJ, XML | MPXJ, XER back |
|---|---|---|---|---|
| Public 24.12 file | 87 (text) | 87 / 87 | 87 / 87 | 87 / 87 |
| Planted | 243 (text, cost, date, number) | 243 / 243 | 243 / 243 | 243 / 243 |

One thing changes type. A finish-date UDF comes back as a start-date UDF,
because Project has only one kind of date field. The dates themselves are
unchanged.

## What we have not shown

These files have not been opened in Microsoft Project or imported into a real
P6. MPXJ stands in for both. The only real resource UDFs we found are text,
so the numeric, cost and date results come from planted values. WBS UDFs
(which would go on Project's summary tasks) are the next gap.

Full method and numbers: `ventures/xer-schedule-check/eval/rsrc-udfs-2026-11-21.md`.
