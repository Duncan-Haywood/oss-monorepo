---
title: "Filling a GC's Procore subcontractor SOV template without retyping your schedule"
seo_title: "Procore subcontractor SOV CSV import: filling the template"
date: 2026-11-25
tags: [payapps, for-customers, construction, schedule-of-values, procore]
description: "A GC on Procore wants your detailed SOV in their CSV template. The import rules, where it fails, and a tool that fills it from your schedule."
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
If your GC's template does not open, the message says what it looked for. Textura and GCPay, and
Procore's monthly subcontractor invoice, are next on the list, not built.

PayApps is in early access: pay applications, retainage, change orders, lien waivers and
QuickBooks for subcontractors. Not affiliated with Procore. This is general information, not legal
or accounting advice.
