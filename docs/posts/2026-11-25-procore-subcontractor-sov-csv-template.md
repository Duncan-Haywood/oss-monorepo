---
title: "Procore for subcontractors: filling the SOV template and the monthly invoice without retyping"
seo_title: "Procore subcontractor SOV import and monthly invoice: what to enter"
date: 2026-11-25
tags: [payapps, for-customers, construction, schedule-of-values, procore, invoicing]
updated: 2026-11-26
description: "Procore SSOV CSV import rules and what each subcontractor invoice column asks for, with tools that fill both from your pay app."
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
live Procore project. Textura and GCPay are next on the list, not built.

PayApps is in early access: pay applications, retainage, change orders, lien waivers and
QuickBooks for subcontractors. Not affiliated with Procore. This is general information, not legal
or accounting advice.
