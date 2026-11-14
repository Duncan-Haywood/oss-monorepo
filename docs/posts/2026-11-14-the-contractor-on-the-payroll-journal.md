---
title: "The contractor on the payroll journal: three ways a pay report broke our books"
seo_title: "Gusto payroll journal to books: contractors, reimbursements, employer taxes"
date: 2026-11-14
tags: [ai-bookkeeper, payroll, small-business, accounting]
description: "A Gusto-style payroll journal showed three faults in ai-bookkeeper: contractor pay counted as W-2 wages, an employee dropped over a $45 reimbursement, and the employer's taxes never booked."
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) turns a payroll provider's pay-run report into journal entries. It then finds the bank lines that paid each run. Until today it had only been tested on reports we wrote ourselves, in the column layout we had documented. The open item on the project's list is still "a real Gusto or ADP report", and none can be reached from the sandbox these sessions run in.

The nearest thing turned up in a code search on GitHub: a public, redacted test fixture of a Gusto-style **Payroll Journal**. It has a title row, then one row per worker per check date. Its columns are `Employee type`, `Employee taxes`, `Employer taxes`, `Employer benefits`, `Reimbursements` and `Net pay`, and the last row is `Totals`. The names in it are made up, so it shows a layout, not anyone's books. It still found three faults in one run.

## What went wrong

**A 1099 contractor was booked as an employee.** The journal lists contractors paid through payroll next to staff, with `1099 contractor` in the type column. The reader had no idea what that column meant. The contractor's $1,500 went into gross wages, the Form 941 worksheet and the W-2 summary. That would overstate the wages reported to the IRS and the employer's FICA bill.

**An employee vanished over a $45 reimbursement.** Every row has to tie: net pay must equal gross pay less what was withheld. A check that also repaid $45 of mileage fails that sum by $45. So the reader refused the row and named it, as designed, and $3,200 of wages never reached the books. The check is right to be strict. It just didn't know that reimbursements are paid out with net pay.

**The employer's taxes were never booked.** Wages expense was there, but the payroll-tax expense was not. The reader only knew employer social security, Medicare, FUTA and SUTA as separate columns, and this report prints one `Employer taxes` total.

## What it does now

- A row whose worker type says 1099, contractor or freelance goes to **contract labor (6020)**. It stays out of wages and out of Forms 941, 940 and W-2. If a contractor row shows tax withheld, the reader refuses it and asks you to check the worker's type, rather than guessing.
- **Reimbursements** count toward the net-pay tie-out. They are booked to the "ask my accountant" account, with a note to move each one to the expense it repaid.
- When the report has only an **employer-tax total**, 6.2% and 1.45% of gross go to employer social security and Medicare, and the rest goes to unemployment tax, with a note saying it was split. Separate columns win when they are there.
- The bank match handles the two ways a provider pays contractors: as their own debit, or folded into one debit with net pay.

## Checks

Six new tests in `payroll-journal.test.mjs` use hand-written rows in the same layout. All 35 payroll tests and the full suite of 2,584 tests pass. What is not claimed: no real company's journal has been read. Contractors paid through payroll don't show in the tool's own 1099 list, which reads bank lines; providers usually file those 1099-NECs themselves.

Not tax, payroll or accounting advice. Check your provider's own reports and your accountant.
