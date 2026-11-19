---
title: "Excel saves a typed true as TRUE, which no IDS boolean matches: reading Excel workbooks as people see them"
seo_title: "Reading Excel-saved .xlsx as an IDS: dates, booleans, 17-digit numbers"
date: 2026-11-19
tags: [bim, ifc, ids, excel, spreadsheet]
description: "Our IDS spreadsheet reader showed 45292 for a typed date and TRUE for true. On 321 real workbooks, cells read right went from 62,182 to 65,537 of 65,548."
---

An IDS file is a list of rules a building model (IFC) has to meet. People
usually agree those rules in a spreadsheet first. This morning our free
[IDS Model Check](../../ventures/ids-model-check/README.md) learned to turn
such a spreadsheet into IDS 1.0 and back, one row per rule. We tested it on
workbooks we wrote ourselves and on workbooks LibreOffice saved, with every
cell stored as text.

A BIM manager's workbook usually comes from Microsoft Excel, and Excel doesn't
store what you type as text. Type `2024-01-01` and it saves the number 45292
with a date format. Type `true` and it saves a boolean, which our reader gave
back as `TRUE`. In IDS a boolean is written `true`, and `TRUE` matches no
IfcBoolean in any model, so a person who typed the right value got a rule
that failed every wall. Excel also saves some fractions to 17 digits
(`0.93827160493827155`) where it shows 15.

## What we measured

Apache POI, the Java library for Office files, keeps 353 `.xlsx` files from
its bug reports in its test data. 289 of them were saved by Excel (desktop,
Mac or Online). We read each file's first worksheet with our reader and with
openpyxl, cell by cell, as the text Excel shows: dates by the cell's number
format as ISO 8601, numbers to 15 digits, booleans as `true`/`false`.

| | before | after |
| --- | ---: | ---: |
| cells read as Excel shows them | 62,182 of 65,548 | 65,537 of 65,548 |
| date and time cells | 0 of 1,149 | 1,139 of 1,149 |
| boolean cells | 0 of 262 | 262 of 262 |
| workbooks with every cell right | 255 of 321 | 316 of 321 |

Most of the 11 cells left are ones where no date exists. A day count of 0
under a date format is Excel's `1900-01-00`, so we keep the number. Six are
`DD.MM.YYYY` dates, which openpyxl reads as a time because it only checks
lower-case format codes; Excel doesn't care about case.

On the way, we found three more problems. One workbook names its parts with
backslashes (`xl\workbook.xml`); Excel opens it, and openpyxl refuses it.
Excel stores a carriage return inside a string as `_x000D_`. And an `.xls`
or a password-protected workbook is an older container format that
our page used to read as CSV, giving nonsense rows. The reader now handles the
first two and names the third, with how to save a plain `.xlsx`.

## Typing is the other half

Reading a typed cell correctly can't undo the typing. A number cell holds
42, whether you typed `42` or `42.0`. That matters to an IDS: buildingSMART's
test suite has a case where `42.0` must be refused as an integer, and once a
spreadsheet has typed it, it passes.

We measured that two ways in LibreOffice Calc, since there's no Excel on our
build machine. First, we opened each IDS's CSV with type detection on, the
way a double-clicked CSV opens. With the new reader, 47 of 56 public IDS files
came back with the same content (24 before), and 302 of 334 buildingSMART
test files (288 before). What is left is mostly numbers whose spelling
changed, which no reader can recover.

Second, we took the workbook our page downloads and retyped every cell a
spreadsheet could turn into a number, date or boolean, through Calc's own
input line, as a person editing it would. With the cells formatted as
General, as they were, 24 of 56 public files came back the same. So the
download now formats every cell, and the empty cells of each column, as
Text:

| retyped download | before | after |
| --- | ---: | ---: |
| public IDS files, same content | 24 of 56 | 56 of 56 |
| buildingSMART test files, same content | 288 of 334 | 334 of 334 |
| buildingSMART verdicts unchanged | 325 of 334 | 334 of 334 |

What you type into the downloaded sheet now stays the characters you typed.

The details and scripts are in
[`eval/excel-workbooks-2026-11-19.md`](../../ventures/ids-model-check/eval/excel-workbooks-2026-11-19.md).
We had no copy of Excel itself to type into. Excel documents the same rule
for Text cells, but we haven't measured it. If you have a real
requirements table, we'd like to run it.
