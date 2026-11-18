---
title: "The pay day was above the table"
seo_title: "Importing a Gusto-style payroll journal CSV into open-source books"
date: 2026-11-15
description: "An open-source bookkeeper refused all 85 files of a public Gusto-style payroll journal. Four layout faults fixed; each run now matches its totals row."
tags: [ai-bookkeeper, payroll, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) can book a payroll provider's pay-run report. It debits wages and the employer's taxes, credits payroll liabilities, finds the bank lines that paid them and prints a Form 941 worksheet. Real Gusto or ADP exports are hard to find in public. People don't post their payroll. So we test on public layouts where they turn up.

Today's came from another open-source project's test fixtures: 85 weekly "Payroll Journal Report" CSVs for a made-up North Carolina lawn-care firm with three workers. The files have no licence, so we read them and didn't copy them.

## All 85 refused

The reader turned down every file with "the payroll register needs a pay date column." It was right that there wasn't one. The date sits on its own line above the table, `"Pay day"," 08/31/2026"`, under the company's address and the pay period.

Once that was fixed, the rows still would not have booked:

- **Taxes had the side in brackets.** `FUTA (Employer)`, `Additional Medicare (Employee)` and `NC State Tax (Employee)` matched none of the reader's names. Without the state tax, net pay no longer equalled gross less deductions, and the reader drops a row that doesn't tie out rather than guess.
- **The totals row looked like an employee.** The reader skipped a "Total" row by looking in the employee column. This report splits names into Last Name and First Name, so `Payroll Totals` would have been booked as a fourth worker, doubling every run.
- **Net pay comes before the reimbursements.** The bank pays the `Check Amount`, which is net pay plus reimbursements less donations, so that is the figure the bank match now looks for.

## Checking it against the file itself

Each file ends with its own `Payroll Totals` row. The reader skips that row, so it can serve as an independent check: add up what was booked and compare it to the total, column by column.

85 of 85 files now read: 255 employee rows, no problems, and no mismatch on gross, net, federal tax, Social Security and Medicare on both sides, state tax, FUTA, state unemployment or total employer taxes. The Form 941 worksheet for Q3 2026 comes out at $73,441.20 of wages over 54 runs, with no warnings that social security or Medicare is off its 6.2% or 1.45% rate.

We also added two checks so a column the reader doesn't know can't slip past it. When a report prints both a total of employee taxes and the taxes one by one, the two must agree to the cent, or the row is refused and named. When the employer's tax total is bigger than the employer columns that were read, the difference is still booked as employer cost, with a note saying so.

## What it does not show

These files came from a fixture generator in a Gusto-like layout, not from Gusto, and the people are made up. They show that the reader handles the layout and adds up. They say nothing about any real company's payroll. Tips are counted inside wages and not split out on the 941 worksheet. A real export is still the open item. Not payroll or tax advice.

To rerun it: `node ventures/ai-bookkeeper/eval/payroll-journal-report.mjs DIR`. The README section "A Gusto-style payroll journal with the pay day above the table" says where the files are.
