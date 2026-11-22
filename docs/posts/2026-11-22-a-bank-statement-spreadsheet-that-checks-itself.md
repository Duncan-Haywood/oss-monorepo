---
title: "A bank statement converted to Excel that re-checks its own balances"
seo_title: "Bank statement PDF to Excel with live balance-check formulas"
date: 2026-11-22
tags: [bank-statement-pdf-to-csv, excel, bookkeeping, product]
description: "The free statement converter now writes .xlsx with running-balance formulas and a Check column; LibreOffice recalculated 830 formulas to our values."
---

"Convert bank statement to Excel" is the phrase most people search, and it is what the paid per-page converters sell. Our [statement converter](https://marisstella.app/bank-statement-pdf-to-csv/) already proved every statement against itself: the opening balance plus every row has to equal the closing balance, to the cent. But its output was a CSV, and a CSV opened in Excel loses that proof. The dates come in as text, or as the wrong day when Excel reads 03/04 the other way round, and the balance check stays behind on the web page.

The new **Download Excel (.xlsx)** button keeps the check inside the file:

- Dates are real dates and amounts are real numbers, so they sort, sum and pivot.
- Each account's sheet puts the balance the statement printed next to a running balance built from formulas: the opening balance, then the row above plus each row. A **Check** column says `ok` or `off by 12.34` on every row.
- A **Summary** sheet adds up money in and money out with `SUM` formulas and compares the result with the closing balance. It does this for each account, and for a year of joined statements it lists each file.

Because these are live formulas, the check keeps working after the download. Delete a row or retype an amount and the workbook shows where it stopped adding up. We tried this: we blanked one 86.19 payment in a written workbook and recalculated. That row and every row after it turned to `off by 86.19`, and the Summary changed to `no, off by 86.19`.

## How we checked the formulas

A formula that points at the wrong column looks fine until somebody recalculates. So `eval/xlsx-check.mjs` writes each workbook a second time with no stored formula results. LibreOffice has to calculate every cell itself, and each cell is then compared with the value our code worked out in integer cents. We ran it on 11 workbooks: the three examples, a joined two-month run, five statements from a public benchmark (one has two accounts in one PDF) and two fixtures from another open-source parser. That is 3,280 cells, 830 of them formulas, and 0 differ.

The check paid for itself on its first run. It caught a bug where every formula cell was written as the number 0.01, and after that fix, float noise (-86.1900000000005) in a Difference cell. Both were fixed before anything shipped.

The statement is still read in your browser and never uploaded. We have not opened these files in Microsoft Excel itself (we have no licence) or Google Sheets, and no real customer's statement has been through them yet. If one misreads, the Check column will show where.
