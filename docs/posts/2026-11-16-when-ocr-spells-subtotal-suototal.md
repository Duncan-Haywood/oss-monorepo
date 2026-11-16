---
title: "When OCR spells Subtotal \"Suototal\": six more receipt taxes from the receipt's own arithmetic"
seo_title: "Reading sales tax from receipt photos when OCR garbles labels"
date: 2026-11-16
description: "Misspelt subtotal labels and tax lines with lost decimals hid the tax on receipt photos. Checking each guess against the total read six more of 185."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt photo into a
merchant, a date, a total and the sales tax, then matches it to the bank line that paid
it. The tax matters to a small business because it is the number that goes on a sales-tax
or VAT return. On 185 real US receipt photos that print a tax (the public ExpressExpense
SRD set, labelled by hand), the command-line reader got it right on 126. On 45 it read no
tax at all.

## What the misses looked like

We printed each photo's four OCR readings, subtotal, tax and total lines only. Most misses
are beyond the reader: in 11 photos no reading holds a tax, subtotal or total line at all,
and in another 27 the total is misread too. Three patterns could be fixed:

- **The subtotal's label misspelt.** Tesseract printed "Suototal 24.08", "Subtota | $20.00",
  "Sudtotal", "ubtotal". The reader looks for "subtotal", so it never had the number it
  checks a tax against. Across the 800 readings, "Subtota" alone appears 31 times.
- **The tax's decimal point lost.** "TAX 211" is $2.11, but only if you can show it.
- **The tax's amount gone, its rate left.** "TAX 8.00% 44" on a $19.44 receipt.

## The fix: guess only what the receipt confirms

A misspelt label is cheap to repair. Any word one letter away from "subtotal" (or its cut
form "subtota"), seven letters or more, is now read as "Subtotal". We stopped at one letter
for a reason: two letters away sits "SOSTOTAL", which is how one photo's *total* line came
out. "Tota]" becomes "Total", and "146..57" becomes 146.57.

The damaged tax lines get no benefit of the doubt. "TAX 211" is read as 2.11 only when a
subtotal on the same receipt plus 2.11 equals a total printed on it (22.25 + 2.11 = 24.36,
before the tip). "TAX 8.00% 44" is read as 1.44 only because $19.44 split at 8% is $18.00 +
$1.44 *and* the tax line still shows the digits "44". A photo whose tax line reads
"TAX 8.25% *=" has a rate but nothing to agree with, so it is left blank. Every one of these
reads carries a "check the tax" note.

## Results

| 185 SRD photos, CLI | before | after |
|---|---|---|
| tax right | 126 (68.1%) | **132 (71.4%)** |
| tax wrong / none | 14 / 45 | 12 / 41 |
| totals right (of 196) | 150 | 151 |

The rules were written from these photos, so that figure is in-sample. The held-out checks,
scored once afterwards: CORD's 352 labelled training receipts went from 322 to 323 taxes
right, and nothing else moved on CORD or on 626 SROIE receipts.

One idea didn't make it. "Tax » 415.35" on a $193.35 receipt is plainly $15.35 with a mark
read as a 4, so we tried dropping a stray leading digit. It fixed nothing: on that photo a
different rule, one that trusts the subtotal, then picked $17.35 from a misread subtotal.
It also turned one blank tax into a wrong one. We took it out.

## What's next

27 of the 41 photos still missing a tax have the wrong total as well, so the next gain is in
reading the total. The per-photo lists are in
[the eval note](../../ventures/ai-bookkeeper/eval/receipt-tax-ocr-labels-2026-11-16.md).
The reader is MIT licensed and runs on your own machine: no receipt leaves it.

*ai-bookkeeper is bookkeeping software, not tax advice. Check any tax it reads against the
receipt before you file.*
