---
title: "A free pay application template in Excel whose totals cannot drift"
seo_title: "Free pay application template (Excel) with live formulas"
date: 2026-11-25
tags: [construction, subcontractors, pay-applications, retainage, excel]
description: "The pay application generator now downloads a blank .xlsx template and the worked application as a workbook with live formulas, checked against LibreOffice."
---

Most subcontractors bill from a spreadsheet. Someone built it years ago,
it gets copied for each job, and every month somebody types over a total
by hand because a row was inserted below the SUM range. The
[pay application generator](https://marisstella.app/pay-application-generator/)
did the arithmetic in the browser, but it only gave you text and a CSV.
A CSV has no formulas, so the first edit after downloading it broke the
totals again.

## What shipped

Two downloads, both free:

- **A blank template (.xlsx).** An *Application* sheet with the nine
  summary lines (original contract sum, net change orders, contract sum to
  date, completed and stored, retainage, earned less retainage, previous
  certificates, payment due, balance to finish) linked to a lettered
  *Continuation sheet* of 30 lines. Retainage on work and on stored
  materials are two input cells; a line can carry its own rate. Type `CO`
  in the type column and the line moves from the original sum to the
  change orders.
- **The worked application as a workbook.** After you work out an
  application on the page, the same layout comes back filled in, with ten
  spare rows that every total already covers, so a line added next week is
  counted without touching a formula.

The layout and wording are the tool's own. It is not the AIA G702/G703
form, which is copyrighted, and the page says so next to the button.

## How it was checked

The file is written by about 200 lines of dependency-free JavaScript: a
stored zip writer and the SpreadsheetML by hand. Each formula also
carries a cached value computed by the page's own arithmetic, because a
phone's file preview does not recalculate, and a blank cell where the
payment due should be is worse than no file at all. The workbook then
asks Excel and LibreOffice to recalculate on open.

So the question is whether the formulas and the page agree. We built the
sample application with the awkward cases switched on: retainage reduced
from 10% to 5% once the job passed 20% complete (on work only; stored
materials keep 10%), a line with its own 7.5% rate and a third of a cent
at stake in the rounding, and a deductive change order. LibreOffice
recalculated the file headless and exported it as CSV. Every summary line
matched the page to the cent: payment due $87,993.33, retainage
$14,190.00. The blank template recalculates to zeros, and the tests in
`workbook.test.mjs` check the zip's CRCs, the formulas' targets and the
cached values on every run.

One safety detail: everything a user typed goes in as an inline string,
never as a formula, so a description that starts with `=` stays text.

## Why a spreadsheet, for a product we mean to sell

The paid product in development is a hosted pay-app suite: schedules
saved per job and carried forward for you, retainage tracked until
release, lien waivers checked against the payment. A sub with one job and
a good spreadsheet doesn't need it. A sub with eight jobs and eight
copies of that spreadsheet does, and they find us by searching for a
template first. So the template is free and good, and the page asks
people who bill on several jobs to tell us how they do it today.

Source: [`ventures/pay-application-generator/workbook.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/pay-application-generator).
The numbers are arithmetic on what you enter; your contract decides the
retainage terms. Not legal, tax or accounting advice.
