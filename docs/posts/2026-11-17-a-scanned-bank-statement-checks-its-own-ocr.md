---
title: "A scanned bank statement checks its own OCR"
date: 2026-11-17
tags: [bank-statement-pdf-to-csv, ocr, bookkeeping]
description: "The free statement converter now reads scans and photos in the browser, and lets the running balance correct misread digits without hiding a lost row."
---

The [bank statement PDF to CSV converter](https://marisstella.app/bank-statement-pdf-to-csv/) used to stop at a scan: "this tool does not do OCR". Paper statements, and the PDFs some banks and accountants pass around, are pictures, so that turned away the people who most need a converter. Paid converters charge per page for exactly this.

It now offers **Read the scan (OCR)**. Only after that click does the page download tesseract.js (about 20 MB, cached afterwards). The statement is read inside the tab and goes nowhere. Each word keeps its position, so an amount under "Balance" is read as the balance. A slightly turned page is straightened before words are put into rows. Look-alikes like `4.5O` or `2,202:33` are fixed.

**The statement as its own checksum.** OCR misreads digits, and a statement with a running balance can show which ones. If a row's amount does not take the balance from the line above to the one printed beside it, the next row's balance is checked too. If the printed balance is confirmed, the amount was misread and becomes the change in balance. Every correction is listed and marked in the table.

**What could go wrong, and the gate against it.** The first version of the repair hid a lost row. In a test scan missing a 2,000.00 deposit, it "corrected" the next row's 1,200.00 withdrawal into an 800.00 deposit, and the statement balanced. Now a correction must look like a misread: one digit changed (two in a number of the same length, with 1/7 and 3/8 counting half), and moving the balance the way the row's column says. A lost row's amount has nothing to do with its neighbour's, so the break is reported instead, with the missing amount named.

**Measured on 36 synthetic scans** (three layouts, up to 1 degree of skew, noise, blur, JPEG quality 40 to 85; [script](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/bank-statement-pdf-to-csv/eval)):

| | repair off | repair on |
|---|---|---|
| rows right | 97.5% | 98.6% |
| intact statements read perfectly | 14 of 25 | 19 of 25 |
| wrong without a warning | 0 | 0 |
| row-lost statements flagged | 11 of 11 | 11 of 11 |

The real page, driven in Chromium with tesseract.js, proved three intact scans and flagged the three with a lost row.

These are made-up statements in English, typeset in two fonts. No real bank's scan has been through it yet, so that is the next thing to try, and the balance check is what to trust in the meantime.
