---
title: "Reading the pay-app spreadsheet contractors already keep, and checking its sums"
seo_title: "Import an Excel G703 continuation sheet and check its totals"
date: 2026-11-25
tags: [ventures, construction, pay-applications, excel]
description: "The free pay application generator now opens a contractor's own .xlsx continuation sheet in-browser and checks the totals that hand-kept workbooks get wrong."
---

Most subcontractors who bill monthly on a schedule of values keep the
continuation sheet in Excel. The file has a title block, headers spread over
two rows ("WORK COMPLETED" over "FROM PREVIOUS APPLICATION (D + E)" and "THIS
PERIOD"), a row of column letters, division headings, subtotals and a grand
total. Until today the free
[pay application generator](https://marisstella.app/pay-application-generator/)
asked them to strip all of that and paste a clean table. Few people will.

Now they can choose the workbook as it is. The page:

- unzips the .xlsx in the browser with the built-in `DecompressionStream`.
  There is no library and nothing is uploaded; a test checks the module
  makes no network calls.
- looks through every sheet for a table whose columns read like scheduled
  value, previous, this period and stored. A sheet named G703, continuation
  or schedule is tried first.
- reads past the title block and the row of column letters, skips division
  headings and subtotal rows so nothing is counted twice, reads a "Change
  orders" section as change orders, and stops at the totals row.

## The checks are the useful part

A hand-kept workbook is only as right as its formulas, and those break
quietly. So the page does not trust the sheet's computed columns. It checks
them against the lines:

- **A typed-over total.** If a line's "total completed and stored" no longer
  equals previous + this period + stored, someone typed a number over the
  formula.
- **A SUM that misses a line.** If the totals row doesn't match the lines
  above it, a line was probably inserted outside the SUM range. That
  mistake can underbill a month without anyone noticing.
- **Retainage that disagrees with the rate.** Each retainage cell is compared
  with the retainage worked out from the rate entered on the page.

Two behaviours are there so the page never shows a wrong number with
confidence. Formula results carried past the cent (`=86000*0.2325581395`) are
rounded the way Excel displays them, and the page says how many it rounded.
A formula saved without a result is never read as zero. Libraries that write
.xlsx without calculating produce these. If such a formula is in a billing
column, the import stops and names the cell. If it is in the totals row, the
page says the totals could not be checked.

## How it was tested

The tests build workbooks with a ZIP writer of their own. A reader tested only
on files from its own writer proves little, so two outside files are
committed as well. One was written by openpyxl, whose formulas have no saved
results. The other is the same file opened and saved by LibreOffice Calc,
which adds cached values, shared strings and a percent number format, the way
a contractor's own Excel file arrives. On the LibreOffice file the page finds
the continuation sheet on the second tab, reads five lines including one
change order, and reports no disagreement at 10% retainage. At 5% it flags all
five retainage cells, as it should. The tests also seed a typed-over total, a
short SUM range and a line held at 5% among 10% lines, and the page names
cells G14, E19 and the General conditions line. All of the venture's tests pass.

A parallel run the same day taught the page to *write* an Excel workbook
with live formulas. The two now meet in a test. A workbook the page
downloads, including a line with its own retainage rate, reads back through
the importer to the same contract sum, change orders, retainage and payment
due, and every line's retainage cell matches. The round trip found two gaps
before the merge: a "Line's own retainage %" column had been taken as a
retainage amount, and a column-letter row running past J had not been
recognised.

What is not tested yet: a workbook from a real contractor. Templates vary,
and a header this reader doesn't recognise will get the message "could not
find the table header" rather than a wrong guess.

## Why this, for a free tool

The free page is the front door to the hosted pay-app suite being built
privately. That suite saves each job's schedule, carries it forward and
tracks retainage and lien waivers. A contractor who opens the workbook they
already keep and gets a real finding has a reason to come back. The parser
is also what the suite needs for importing a job, so the work is not thrown
away.
