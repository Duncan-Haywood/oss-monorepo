---
title: "Procore, Textura, GCPay and Trimble Pay for subs: filling the GC's templates and invoices without retyping"
seo_title: "Procore, Textura, GCPay and Trimble Pay SOV uploads: what to enter"
date: 2026-11-25
tags: [payapps, for-customers, construction, schedule-of-values, procore, textura, gcpay, trimble-pay, invoicing]
updated: 2026-11-27
description: "Procore SSOV import and invoice, Textura billing upload, GCPay SOV upload and Trimble Pay's Flashtract template, filled from your pay app."
---

*Written by an AI agent working in this repository.*

A general contractor on Procore sets up your subcontract as a commitment with a few schedule of
values lines of its own: "Electrical, $1,250,000", maybe split into rough-in and trim. When they
want your breakdown underneath, Procore gives them a **Subcontractor Schedule of Values (SSOV)**
and a CSV template to fill. You already have that breakdown in your bid spreadsheet or your pay app
software. The job is getting it into their file without breaking the import.

## What the template is and where it comes from

In Procore, on the commitment, the Subcontractor Schedule of Values tab has **Edit SSOV**, then
**Import CSV**, then **Download CSV Template**. The file has one row per line of the GC's SOV. If
you are invited as the invoice contact you may be able to do this yourself; otherwise ask the GC's
project manager to send the template. ([Procore's instructions](https://v2.support.procore.com/product-manuals/commitments-project/tutorials/import-a-subcontractor-schedule-of-values-from-a-csv))

The columns Procore's help page lists are SOV Position Number, Budget Code, SOV Description,
SOV Amount, Subcontractor SOV Description and Subcontractor SOV Amount. You add your lines as more
rows under each position.

## The rules that make an import fail

From the same help page, in plain words:

- **Don't add, move, remove or rename columns.** Paste your sheet over theirs and the import fails.
- **Every row needs the SOV Position Number and the SOV Amount.** A detail row you add must carry
  the GC's position and amount, not just your own description and amount.
- **Your amount is a plain number.** `15000`, not `$15,000` or `15,000.00`. Excel's currency format
  saved to CSV breaks this quietly.
- **No blank amounts.** A position you put nothing under gets `0.00`.
- The template can be comma or semicolon separated (the GC picks when downloading). Keep whichever
  you received.

Two things the page does not say outright but worth knowing: change orders sit apart from the SOV
in Procore (commitment change orders), so your breakdown is of the base contract; and if the SSOV
already has detail lines, Procore asks whether to add to them or replace them.

## Doing it in PayApps

PayApps now has a **Procore subcontractor SOV** button under the job's schedule of values. Choose
the GC's template, and it:

1. reads the GC's positions from their file;
2. puts each of your lines under a position: all of them if there is one, otherwise a guess by
   matching amount or wording that you can change line by line;
3. shows each position's total against the GC's amount ("matches", or over or under by how much);
4. writes the filled template, keeping their header, column order, delimiter and every cell of
   theirs, and writing only the two subcontractor columns, amounts as plain numbers.

The file is read and written in your browser; it is not uploaded. Then use Import CSV in Procore.

**What we have not done yet:** tried it on a live Procore project. The column names come from
Procore's help page, and the reader accepts small variations ("Position Number", "Sub Amount").
If your GC's template does not open, the message says what it looked for.

## Every month: the Procore invoice

Once the SSOV is in, the GC usually wants each month's billing as a **Procore subcontractor
invoice** as well as (or instead of) your G702/G703. You open the commitment, click **Create
Invoice** (or follow the GC's "Invite to Bill" email) and type amounts in line by line. Procore's
help pages describe exporting an invoice to CSV, but no CSV import for one, so this is typing.

What the columns ask for, from Procore's help page "Create a New Subcontractor Invoice as an
Invoice Contact":

- **Work Completed This Period:** "Enter an amount for the current billing period." This is
  column E of your continuation sheet, work done this month with stored materials left out.
- **Materials Presently Stored** (Procore's older invoice form): the materials stored in the
  current billing period, the same idea as column F.
- **New Materials Stored** (the newer form): "the amount of any new materials being stored for the
  current billing period. Your entry should exclude any costs entered in the 'Work Completed this
  Period' column." It only appears when the GC turned on billing stored materials separately for
  your commitment.

The trap is the last one. Column F on a G703 is the **balance** stored and not yet installed. The
newer Procore field wants only what is **new** this month. If you had $3,000 of wire on site last
month, installed it and took $1,000 more delivery, F reads $1,000 and the balance went down by
$2,000, but the new amount is $1,000. You can't work that out from the two balances. You need
your delivery records.

## Doing it in PayApps

Each pay application now has a **Procore invoice sheet**. It lists every line of the schedule
with the numbers to type: Work Completed This Period, Materials Presently Stored and New Materials
Stored, each with a copy button, plus percent complete and totals. That way the Procore invoice
matches the pay app PDF you send.

- New Materials Stored is filled in only when it is certain: on the job's first application (all of
  F is new), or when a line's stored balance only went up since the last one (the rise is new).
- Where a line's stored balance went down, it says **check** and names the line, so you enter the
  amount from your delivery records instead of a figure we made up. It does the same on the first
  application of a job you moved over mid-way, since the earlier stored balance isn't known.
- Change order lines are marked.
- A CSV download keeps the sheet for your records. It is a worksheet, not a Procore import.

Retainage on a Procore invoice is set on the GC's side, so compare their invoice total with line 8
of your pay app before you submit. If the GC's invoice lists their own SOV positions rather than
your SSOV lines, add up your lines under each position.

As with the SSOV filler, this is built from Procore's published help and has not been tried on a
live Procore project.

## If the GC is on Textura: Upload Billing Amounts

Oracle's Textura works the other way round from Procore's invoice: you *can* fill the monthly
invoice from a file. In your billing workflow, on the **Progress** tab, the **More** menu has
**Upload Billing Amounts**. The dialog asks whether you are uploading **This Period Billing
Amounts** or **To Date Billing Amounts**, and its **Download Template** button gives "a
pre-formatted Excel spreadsheet" that "includes phase codes, description, budget amounts, and the
current billing amounts for the line items in your contract." You fill it, save it as CSV and
upload it in the same dialog. ([Oracle's instructions](https://docs.oracle.com/cd/E97085_01/TPMhelp/en/Europe/10307605.htm))

What the fields mean, from Oracle's Subcontractor Billing Workflow Guide:

- **Work This Period:** "the dollar amount of the work completed between the draw Period From and
  Period To dates." Column E of your continuation sheet.
- **Material Stored This Period:** "the dollar amount of material stored between the Period From
  and Period To dates." Like Procore's New Materials Stored, this is what came in this period, not
  the balance on site in column F, so the same trap applies.
- **Retention:** Oracle warns that "if your retention amounts do not meet the retention settings,
  the system will override the amounts in the file." The GC's draw settings win.

Two things to get right. Pick the upload that matches your numbers: **This Period** for this
month's amounts (a G703's column E), **To Date** for running totals (column G). And start from the
template Textura gave you, changing only the amounts: it comes from the contract's schedule of
values in Textura, so its rows are the ones the upload knows.

### This Period or To Date?

Oracle's Progress tab page describes the editable **Completed to Date** field as "the total
monetary value ... for the current and previous periods", and says that entering Material Stored
This Period "will automatically adjust the Completed to Date" field. So Completed to Date includes
stored materials: it is your G703's column G (work completed from previous applications, plus this
period, plus materials presently stored), not column D + E alone.
([Oracle's field overview](https://docs.oracle.com/cd/E97085_01/TPMhelp/en/Europe/10313240.htm))

The To Date upload is the safer one when the This Period numbers are awkward to work out:

- **Stored materials went down** (some were installed). Textura's Material Stored This Period
  wants what *came in* this period, which you can't read off a falling balance. A running total
  doesn't care.
- **You started billing in Textura partway through the job,** or your earlier applications were
  done somewhere else. To Date needs only today's totals.

The catch: if Textura's earlier periods don't match yours (a period the GC cut, a change order
billed differently), a To Date figure lower than what Textura already shows would bill a
*negative* period on that line. Compare before you upload.

Oracle's pages don't publish the template's column headings, so a tool filling it has to read
them from the file you downloaded.

## Doing it in PayApps

Each pay application now has a **Textura billing upload** button. Choose the template Textura
gave you (the CSV, or the Excel file as downloaded), and it:

1. tells This Period from To Date by the template's headings (you can switch it), and finds the
   columns to fill: Work This Period and Material Stored This Period, or Completed to Date and a
   stored-to-date column if the template has one. If your GC's template words them differently,
   you point at the right column;
2. matches each Textura row to one of your lines: same phase code as your item number, else the
   same description, else the only line whose scheduled value equals the row's budget. You can
   change any match, or leave a row as Textura wrote it;
3. writes this application's work this period and the materials newly stored on each matched row
   (To Date: column G, and column F where there is a stored column), amounts as plain numbers, and keeps every other cell, row and the delimiter as they were.
   Retention cells are left alone;
4. points out lines you billed that are on no Textura row (the upload would leave their amount
   out), budgets that differ from your scheduled value (often a change order not yet in Textura),
   stored materials it can't work out from the balances (This Period only; that cell is left for
   you), and To Date lines where Textura already shows more than your application.

The file is read and written in your browser. Upload the result in the same Textura dialog and
check the table it shows before you continue. Like the Procore tools, this is built from Oracle's
published help and has not been tried on a live Textura project or a template a GC has sent us.

## If the GC is on GCPay: the schedule of values upload

On GCPay the GC usually enters your contract amount first (a "constrained" schedule of values) and
you enter the breakdown underneath. You can type it line by line, or click **Upload** under Line
Items. GCPay's Subcontractor Training Guide sets the rules for the upload
([the guide, Rev. 12/19, as one GC publishes it for its subs](https://chambersconstruction.com/uploads/1/3/4/9/134926541/gcpay_subcontractor_guide.pdf)):

- **Excel only.** "The system will not upload a document saved as any other file format." A CSV
  won't do.
- **Three columns, nothing else.** "A standard Schedule of Values will be 3 columns: Item Number,
  Description, Value." If you use your own workbook, "remove any and all information outside of"
  those. (A unit price schedule has five: Item Number, Description, Units, Unit Description, Unit
  Value.)
- **The values add up to the contract.** "The sum of values entered should equal your Original
  Contract Value. You will not be able to submit if you contract totals do not match the amount
  entered by your General Contractor." Value is each line's total, "not your current billing
  amount".
- **Base contract only.** "Change orders will be added by your General Contractor AFTER your base
  contract value has been approved in GCPay."

The guide recommends copying your lines onto GCPay's own downloadable template. That is the
fallback if a file of your own is refused.

Monthly billing on GCPay is typed, not uploaded: on the application for payment you enter amounts
in the **$ This Period** column (or a percentage in **% Work to Date**), and retention is worked
out on GCPay's side. The guide describes no billing upload. Column E of your continuation sheet is
what goes in $ This Period.

## Doing it in PayApps

The job page now has a **GCPay SOV (Excel)** button next to the Procore one. It downloads a
one-sheet workbook with exactly GCPay's three columns, your base contract's lines in order (item
numbers kept as written, so "01" stays "01"), and before you download it says:

- whether the lines add up to the job's original contract sum, or how far over or under they are,
  since GCPay will refuse the submission otherwise;
- which lines have no item number (GCPay's Auto Number box can fill those after the upload);
- which item numbers are used twice.

If your job has unit-price lines (a quantity, unit and unit price on the line), the panel offers
GCPay's five-column **unit price** layout instead: Units is the contract quantity, Unit Description
its unit (CY, LF) and Unit Value the price of one unit, and a lump-sum line goes in as 1 LS at its
value. The guide names those five columns without defining them, so that reading is ours: compare
it with the GC's unit-price template before you upload. How unit-price lines are billed each month
is in [unit-price pay applications](2026-11-26-unit-price-pay-applications.md).

The workbook is made in your browser. Like the Procore and Textura tools, it follows GCPay's
published guide and has not been tried on a live GCPay project; the guide is from 2019 and the
screens may have moved since. If GCPay refuses the file, paste the rows into the template it
offers.

## If the GC is on Trimble Pay: the Flashtract template

Trimble Pay (Flashtract before Trimble bought it) invites you to the GC's contract, and before your
first pay application you build the schedule of values under it, by hand or with a bulk upload.
Trimble's help for invited subcontractors sets the rules
([SOV - Upload a Template](https://help.trimble.com/en/trimble-pay/trimble-pay/invited-subcontractors/schedule-of-values/sov---upload-a-template)
and [Set up a Schedule of Values](https://help.trimble.com/doc/trimble-pay/trimble-pay/invited-subcontractors/quick-start/set-up-a-schedule-of-values),
read 2026-11-27):

- open the contract, go to the SOV and click **Bulk upload** (on a contract with accounting lines,
  the Bulk Upload icon at the top of the schedule or in the accounting line's own section);
- download the Flashtract template from that window, "fill out columns A, B, and C completely" and
  leave the row 1 and row 2 headers unchanged;
- no blank rows between line items, no section header rows, and no current period values: billing
  comes later, on the pay application;
- the lines must add up to the current contract value, and every line needs a description, or the
  contract shows "Schedule of values incomplete". With accounting lines (cost code groups), the
  lines in each group must add up to that group's value.

Trimble's page does not say which of A, B and C is which, and the template is the GC's own
download, so the safe way is to fill the file Trimble Pay gives you rather than build a new one.

## Doing it in PayApps

The job page has a **Trimble Pay SOV** button next to the GCPay one. Choose the Flashtract template
you downloaded (.xlsx, or a .csv if you saved it that way); PayApps keeps its first two rows exactly
as they are, reads from the header which column is the item number, the description and the value
(you can change each one, and it asks when the header does not say), and writes your lines from row
3 down with no gaps. Before you download it says:

- whether the lines add up to the contract value, or how far over or under they are. A job with
  change orders lets you choose the current contract (approved change orders included, each as its
  own line) or the original contract only, for a GC that adds change orders on its side;
- which lines have no description (Trimble Pay needs one on each) or no item number, and which item
  numbers repeat;
- whether the template already had rows under the header (example lines): the download replaces
  them.

The file is made in your browser. It follows Trimble's published help and has not been tried on a
live Trimble Pay contract. If the GC uses accounting lines, upload each group's lines into that
group, so check the grouping first.

PayApps is in early access: pay applications, retainage, change orders, lien waivers and
QuickBooks for subcontractors. Not affiliated with Procore, Oracle, GCPay or Trimble. This is general information, not legal
or accounting advice.
