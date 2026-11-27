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

## Update, later the same day: the reader sets up a job in the suite

That last sentence is now true. The hosted pay-app suite (PayApps,
then in development; open on its Free plan since 2026-11-27) can start a job from the same spreadsheet.
On a job's schedule of values there is an "Import from Excel or CSV" button.
The contractor chooses the bid breakdown, SOV tab or continuation sheet they
already have. The file is read in the browser, as on the free page, and is
not uploaded. Before anything is saved, a preview shows:

- every line it will add, with the cell it came from (`cell C9`);
- every row it left out and why. Division headings and subtotals are not
  work. A total ends the table. Change-order lines are left out because the
  original schedule is the contract as signed. A change order is added
  separately, with the approval date that decides which pay app it first
  counts in;
- whether the sheet's own total agrees with its lines. A SUM that misses an
  inserted line is named, the same check as the free page;
- how far the imported total is from the contract sum, because the two must
  match before the first pay application can be submitted.

A cell showing `#REF!`, a value like "TBD" or a negative original line stops
the import with the cell named. Nothing is guessed. Semicolon-separated CSVs
with decimal commas, as European Excel saves them, are read too.

One limit is stated in the preview rather than hidden. If the sheet is a
continuation sheet partway through a job, the preview shows how much it
says is already billed, and says that the suite does not yet carry billing
from pay apps made elsewhere. So a contractor can move a job that has not
billed yet. Moving a job that is already running, with its billed-to-date
and retainage held, is the next item on the suite's roadmap.

The tests run the import on the same two real workbooks as the free page,
one saved by LibreOffice and one written by a library that does not
calculate. The LibreOffice file gives four contract lines totalling
$230,150.75. Its change order is left out and listed. Its grand total of
$249,050.75 is accepted as lines plus the change order. On the
uncalculated file, the preview says the sheet's total could not be checked
instead of reading it as zero.

## Update: a job that is already billing can move too

The limit above is gone. A job's page in the suite now asks "Already billing
this job somewhere else?" The contractor copies five things off their last
pay application, the one made in the spreadsheet or the old software:

- its number, so the first application in the suite is the next one (after
  #3 comes #4, which is what the GC expects);
- its period end. The first period in the suite has to start after it. A
  change order approved by that date counts as a previous change order,
  because the old application already billed it;
- line 6, total earned less retainage. It becomes line 7, "less previous
  certificates", on the first application, so the payment due is only the
  new work;
- work completed to date on each line, columns D + E of the old
  continuation sheet. It becomes column D. Stored materials are left out:
  they are a balance, entered again on the next application;
- optionally, line 5a, retainage on completed work.

Line 5a is the only figure that can be checked, so it is. The suite
recomputes retainage on all the work carried over at the first
application's rate. If that does not match what the old application held,
the application shows a warning with both numbers. It does not block
submission. A gap usually means one of two things. Retainage was already
released before the move, which is entered as a release. Or the rate
changed, which is set on the application. A wrong figure is shown, not
quietly smoothed over.

The test that matters: a job billed #1 in one place and #2 and #3 in the
suite comes out with the same #2 and #3, every column and summary line, as
a job billed all three times in the suite. On a worked example (a $100,000
subcontract, $45,000 of work and $40,500 certified on #3 elsewhere, then
$10,000 of work at 10% retainage), application #4 shows $40,500 as previous
certificates and $9,000 due.

The opening can be changed until the first application is made in the
suite. After that it is locked, like the original schedule of values. The
import does not yet
fill the opening from the spreadsheet itself: the sheet's "to date" column
mixes stored materials into completed work, and that needs splitting out
first.

## Update: the opening fills itself, from the workbook or a PDF

That last limit is gone too. "Fill from your last continuation sheet" on
the opening form reads the file of the last application sent elsewhere and
fills the figures above. Nothing is saved until the contractor checks them.
Stored materials are split out: work completed is columns D + E, never G.
When the workbook also has the summary page (G702) on another tab, line 6
and line 5a come from there, so a job with stored materials no longer leaves
5a blank.

Many subs keep only the PDF they emailed the GC, not the workbook. That PDF
now works the same way. The summary page is read by its line labels, the way
a person reads it. That takes a few rules a person follows without
thinking:

- the amount is the first dollar figure to the right of the label. The
  architect's "amount certified" printed beside line 6 is not line 6, and the
  "10" typed into the "a. ___ % of completed work" blank is a rate, not
  $10.00;
- leader dots, a "$" printed at the edge of the cell and a note after the
  amount ("Line 4 less line 5") are not part of the figure;
- the summary page is kept out of the continuation sheet's table. Its 5a and
  5b lines line up with the sheet's columns and used to blur them.

Two smaller reader fixes came from the same test file. Capitals that a
browser kerns ("RET" and "AINAGE", "CER" and "TIFIED") are drawn as two
pieces and are now joined into one word again. Column letters printed in the
same cell as their label ("A Item No.") no longer hide the item numbers.

On a test application printed by Chromium (four lines and a change order,
$44,500 of switchgear stored), the fill gives line 6 as $125,662.72 and
line 5a as $9,512.53, both matching the printed form, with no warnings. The
free template printed by LibreOffice gives its line 6 ($71,865.00) from the
PDF. Its .xlsx cannot, because that file's formulas were saved without
results.

## Update: retainage that was already released before the move

One case still came out wrong. Say a sub finished the underground on a job
and the GC released that line's retainage on application #6, kept in a
spreadsheet. The job then moves to the suite at #7. The suite used to work
out retainage on all the work carried over at the job's rate, so the first
application here held the released money again, and line 8 came out low by
that much. The only fix was to enter the release on #7, which printed it as
released "this period". That is not what happened, and a GC's reviewer would
ask about it.

The opening balance form now has a box, "Some retainage was already
released on certain lines". Ticking it shows a column where the sub enters
what was released on each line up to the last application. That amount
counts as released before the first application here. Column I and line 5
then start from what the GC actually still holds.

How it was checked: three applications were billed in the suite, the second
releasing $1,000 of one line's retainage. The same job was then started at
#3 from an opening balance of #2, with the $1,000 entered on that line. Both
ways give the same application #3, down to every line. Leave the release
out, and #3's line 6 comes out $1,000 lower, with a warning that names the
amount and says where to enter it. A release on a line with no work is
refused, and one above what the line held is flagged, as on any
application.

The fill from the last continuation sheet does not guess this figure. The
sheet's retainage column shows what is held, not why it is lower than the
rate, and a different rate earlier in the job gives the same picture.

PayApps is open now: free on one active job, with no card
([start free](https://payapps.marisstella.app/?signup&from=pay-application-generator)). Lien waivers, QuickBooks and job costing are in the
paid plans, which are not on sale yet.
