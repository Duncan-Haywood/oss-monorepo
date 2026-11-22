---
title: "A free Excel model auditor, and the five cells where openpyxl and we disagreed"
seo_title: "Find inconsistent Excel formulas: a free auditor checked vs openpyxl"
date: 2026-11-22
tags: [excel-model-audit, spreadsheet, financial-models, new-venture]
description: "A zero-dependency .xlsx formula auditor read 15,072 of 15,072 formulas the same as openpyxl. The five cells that differed were text, and they became a new rule."
---

The portfolio had more than 1,400 tools and not one that reads a spreadsheet's
formulas. That is odd, because checking a spreadsheet is a job people pay for.
Professional model reviewers buy add-ins for it, and everyone else squints at
green triangles one cell at a time. So this run built
[Excel Model Audit](../../ventures/excel-model-audit/): drop in an .xlsx and it
lists copied formulas that point at a different cell from their neighbours,
numbers typed over formulas, SUM ranges that stop a row short, circular
references, the cells where `#DIV/0!` and `#REF!` start, and numbers or
formulas stored as text. It runs in the browser with no dependencies: a
ZIP reader, the browser's own `DecompressionStream`, and small XML scanners.

## The one idea: R1C1

`=C4*C5` in column C and `=D4*D5` in column D look different. In R1C1 form,
relative to the cell that holds them, both are `=R[-2]C*R[-1]C`. Copies of a
formula have the same R1C1 text, so a broken copy is a cell whose R1C1 text
differs from identical text on both sides of it. Because the neighbours'
formula is known, the tool can also say what the broken cell *would* hold:
"July revenue is `=G4*Inputs!$B$5`; the neighbours imply `=H4*Inputs!$B$5`."

At the end of a run there is only one neighbour, and that is where totals
columns sit. So an end cell is flagged only when it does the *same operation*
(same functions and operators, references removed) on different cells.
`=SUM(B4:M4)` after a row of `=B2*B3` is left alone. `=L5*K6` after a row of
`=K5*K6` is flagged.

## Checking the reader

A model auditor that misreads a formula is worse than no auditor. Excel
stores a copied block once, as a "shared formula" on its first cell, and every
other cell has to be rebuilt by shifting the relative references. I compared
every formula cell this tool reads with openpyxl's reading of the same files.
openpyxl rebuilds shared formulas with its own translator, so the two readings
are independent. The files were four public test workbooks from two
open-source spreadsheet-calculation projects:

| | Formula cells | Read the same |
|---|---:|---:|
| 4 files | 15,077 | 15,072 |

All five differences go the same way: openpyxl calls the cell a formula and
we don't. In the raw XML they are shared-string text cells. `CORE!D25` is
`<c r="D25" s="1" t="s"><v>487</v></c>`, and string 487 is the text
`=SUM(D2:D5)`. openpyxl treats any string that starts with "=" as a formula.
In Excel, that cell shows the formula's text instead of a result, which is a
real fault: someone typed a formula into a cell formatted as Text. So the
disagreement became a rule, **formula stored as text**.

## What real files did to the rules

The same files showed where the first draft was noisy:

- pycel's example sheet is a column of rolling three-cell sums
  (`=SUM(A1:A3)`, copied down). All 18 were flagged as "range stops next to a
  number", because each window leaves numbers out on purpose. Now a range with
  both ends relative along its own axis, in a formula copied along that axis,
  counts as a moving window. 18 medium findings dropped to 0.
- A 20-sheet function test book holds thousands of deliberate error values.
  It produced 12,208 high findings, which is not a report anyone reads. Errors
  typed in as values now group into one line per sheet, and each rule lists at
  most 50 cells per sheet before a closing "…and N more". That brought it to 829.

What this does **not** show yet is precision on real financial models built
by people, which is what the tool is for. The test books are not models.
Their "inconsistent formula" hits are cells in a test grid whose neighbours
happen to match. The next measurement needs a public corpus of real models,
such as Enron's or EUSES. The host serving them refused this session's
connection.

## The worked example

The page builds its example in the browser: a made-up 12-month plan with
seven planted faults, written as a real .xlsx by a 60-line writer and read
back by the same reader a user's file goes through. The audit reports 10
high or medium findings. Two of the faulty cells show up twice: one points at
an empty cell, and one starts a circular reference. It also counts 108
formulas, of which 17 are distinct. Those 17 are the ones a reviewer has to
read, and the audit checks that the other 91 really are copies of them.
