---
title: "A free pay application template in Excel whose totals cannot drift"
seo_title: "Free pay application template (Excel) with live formulas"
date: 2026-11-25
tags: [construction, subcontractors, pay-applications, retainage, excel, pay-application-generator, for-customers]
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

### Later the same day: the check became a test

That LibreOffice run happened once, by hand, and it had a gap: the file
it opened still carried the cached values. A spreadsheet app that trusts
the cache shows the right numbers whatever the formulas say, so a
matching export did not prove the formulas were right.

[`recalc.test.mjs`](../../ventures/pay-application-generator/recalc.test.mjs)
now does it properly on every local run. It deletes every cached value
from the workbook, so LibreOffice has to work each formula out from
scratch, exports the raw values (not the values as displayed, which the
cell format rounds to the cent and would hide a formula that is off by a
fraction of one), and compares lines 1 to 9 and each line's completed
total and retainage with the page's arithmetic. It runs three
applications: the page's worked example (payment due $84,870.00), a job
past a retainage reduction point where work drops to 2.5% while stored
materials stay at 5%, and a line with its own 7.5% rate and odd cents.

Before trusting it, we broke the workbook three ways and checked the test
noticed: stored materials charged at the work rate, retainage rounded to
a tenth of a cent instead of a cent, and the change-order filter
misspelt. The first draft of the test caught none of the first two. Every
case had the same rate for work and stored materials, and the export
rounded the evidence away. Both holes are closed, and all three breaks now
fail. The test skips on machines without LibreOffice, which includes most
CI runners, so it is a check to run after touching the workbook code, not
a gate.

### 2026-11-26: a cent on deductive change orders

A red-team pass on the workbook code found one case the three
applications missed: half a cent of retainage on a negative amount. Ten
percent of a $1,234.55 deductive change order is $123.455. The page used
JavaScript's `Math.round`, which rounds halves up, toward positive, so it
credited back $123.45 while the same amount billed held $123.46. The
workbook's `ROUND` formulas, like Excel's and LibreOffice's, round halves
away from zero and gave $123.46 both ways. On a job with that change
order, the page and the downloaded file disagreed on retainage, and on
payment due, by one cent.

The page now rounds the way the spreadsheet does, so a deduction is the
mirror image of the same amount billed. A fourth application in
`recalc.test.mjs` covers it, and because that test skips where
LibreOffice is not installed, `calc.test.mjs` gained one that runs
everywhere: 300 seeded amounts ending in five cents at 10%, 5%, 2.5% and
random rates, each checked that negating the line negates its retainage.
Both fail on the old rounding.

The template also has its own page now,
[free pay application template for Excel](https://marisstella.app/pay-application-generator/pay-application-template.html),
with what each lettered column's formula does and how to roll it to next
month. If you are still drawing up the schedule of values itself, the
pay app guides have a
[schedule of values template](https://marisstella.app/pay-app-guides/schedule-of-values-template.html)
for that step, and the template page links to it.

One safety detail: everything a user typed goes in as an inline string,
never as a formula, so a description that starts with `=` stays text.

## Checking the numbers from a phone

Updated 2026-11-26. Plenty of pay apps get a last look on a phone in the
truck before they go out, and the results were hard to read there. At
390 px wide the line-by-line table was 1,004 px across, so you saw Item,
Description and Scheduled and had to scroll sideways for everything else.
The summary was padded text for pasting into an email, and on a narrow
screen each amount wrapped onto the line below its label.

Now, under 600 px, each schedule line is a card: "4 Electrical rough-in"
on top, then Scheduled, Previous, This period, Stored, Completed, Percent
complete, Balance to finish and Retainage, two to a row with the name
above each amount, so the four you check first (Scheduled, Previous,
This period, Stored) fit in the top half of the card. A card is 238 px
tall on a 390 px phone, down from 310 px when each amount had its own
row, and the ten-line example's table went from 3,230 px to 2,511. The
summary shows as nine label-and-amount rows ("8. CURRENT PAYMENT DUE
(6 - 7) ... $84,870.00" on the worked example). The text you download or
print is the same padded text as before; only the on-screen view changed.
Input boxes are 16 px on a phone, so iPhone Safari no longer zooms the
page when you tap one.

Updated 2026-11-27. Once a schedule is pasted, the page works it out as
you edit, with no button press. A dark strip pinned to the bottom of the
form shows the payment due, the retainage held and how many findings there
are, so you can change the retainage rate at the top of the form and watch
the answer move without scrolling down to the result. On the worked
example's schedule at the default 10%, the strip reads $84,870.00 due and
$24,530.00 held; at 5% it reads $89,585.00 and $12,265.00. A paste the
page cannot read puts the reason in the strip and hides the old result, so
a stale figure is never on screen. A chosen Excel file still waits for the
button, and the live preview counts no usage.

Also updated 2026-11-27, for anyone billing from a phone. The paste box no
longer scrolls sideways inside itself on a narrow screen: at 390 px it used
to show 322 px of a 542 px line, so you saw the middle of each row; it now
wraps, and a note under it says how many lines it holds (11 for the worked
example). Both the generator and the template guide now follow the phone's
dark setting, from one set of colour tokens; a printed application stays
dark ink on white either way. An automated accessibility check (axe, WCAG A
and AA) passes on the filled-in result in both colour schemes, at phone and
desktop widths.

## Why a spreadsheet, for a product we mean to sell

The paid product is PayApps, a hosted pay-app suite: schedules
saved per job and carried forward for you, retainage tracked until
release, lien waivers checked against the payment. A sub with one job and
a good spreadsheet doesn't need it. A sub with eight jobs and eight
copies of that spreadsheet does, and they find us by searching for a
template first. So the template is free and good.

## Update, 2026-11-27: PayApps is open, and takes this workbook

PayApps opened on its Free plan: one active job, no card
([start free](https://payapps.marisstella.app/?signup&from=pay-application-generator)). If you already bill from this template or the
generator's Excel download, you don't retype anything. When you set up the
job, choose the workbook: the schedule of values is read from the
Continuation sheet (subtotal, total and change-order rows left out of the contract lines and listed, the sheet's
own totals checked against its lines), and the work billed to date can be
filled in as the job's opening balance, so the first application in
PayApps carries on from your last one. The workbook is read in your browser;
PayApps' own tests run on files this generator wrote and LibreOffice saved.

Free covers pay applications with retainage and change orders, as PDF and
CSV. Lien waivers, QuickBooks and job costing are in the paid plans, which
are not on sale yet. The template and the generator stay free.

Source: [`ventures/pay-application-generator/workbook.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/pay-application-generator).
The numbers are arithmetic on what you enter; your contract decides the
retainage terms. Not legal, tax or accounting advice.
