---
title: "Where our receipt reader still lost the tax: Target's state lines, VAT tables and 'total includes GST'"
seo_title: "Receipt OCR: reading tax from VAT tables and state tax lines"
date: 2026-11-17
description: "633 fresh receipt photos showed where tax went unread: Target state lines, VAT tables, GST-included lines. Big gain on them, a small one held out."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and picks out the total and the tax. Earlier today we
[tested it on WildReceipt](2026-11-17-receipt-reader-on-472-receipts-it-never-saw.md), a
research set of shop, restaurant, fuel and hotel receipts from the US, Europe, Asia and
Australia. Totals held up (88%). Taxes did not: a quarter of the labelled ones were left unread.

This run took the second half of WildReceipt's training photos, 633 we had never opened, and
read every tax the reader missed. Most of them fell into four shapes.

**1. Target's state tax line.** Target prints `T=CTTAX 6.3500% on $117.15 $7.44`. The state
code is glued to the word, so `CTTAX`, `NJTAX`, `FLTAX` and `ALTAX` did not read as "tax".
Seven receipts, one store chain.

**2. VAT tables.** Many European and hotel receipts print a small table instead of a tax line:

```
Net.Amt   VAT    Amount
566.96    68.04  635.00
```

The reader took the last number on the line, which is the gross, which is the total, so it
threw the line away. Now, on a line with a tax word or under a header of tax words, three
amounts where the first two add up to the third give the middle one as the tax. When the tax
amount itself was lost and the row reads `34.17 20.00% 41.00`, 34.17 at 20% is 41.00, so the
tax is 6.83.

**3. "Total includes GST of 0.26."** Australian and Singaporean receipts print the tax inside
the total this way. This morning's run taught the reader that this line is not the total; it
still was not reading its amount as the tax.

**4. Glued words in other languages**: French `TVA8%`, the Canary Islands' `IGIC7%`, and a
rate printed before the word (`20.600TAX`).

We also fixed a bug no photo in this shard had shown: when OCR reads `US$12.50` as `USS12.50`,
the reader took 5,512.50, because the step that repairs OCR's letter-for-digit mistakes read
each `S` as a 5 (`ECS161.04`, an Eastern Caribbean dollar amount, became 5,161.04 the same way).

**Results.** On the 633 development photos, the command line's five readings went from 262 to
273 of 335 taxes right, with totals unchanged (472 of 538). RapidOCR alone went from 235 to
256. On the 472 held-out test photos, which no rule in this run was written from and which we
scored once before and once after, the gain was **small: 204 to 207 of 272 taxes, and totals
359 to 360 of 405**. In the one mode we checked receipt by receipt (RapidOCR alone, counted
without reading the receipts), no right answer went wrong.

That gap is the honest result. The largest shape we found, Target's line, belongs to one
chain, so it can only help on Target receipts; we did not open the test photos to count them,
since that would spend the test set. Rules written from what one
set of receipts gets wrong carry over to new receipts only as far as those receipts share the
same layouts. With every WildReceipt photo now read, the next useful step is not more rules
from these photos but a fresh labelled source to check them on.

Every number, the rules and the caveats are in the
[evaluation report](../../ventures/ai-bookkeeper/eval/wildreceipt-train1-2026-11-17.md).

ai-bookkeeper is free and MIT licensed. It is bookkeeping software, not tax advice: check the
tax it reads against the receipt before you file anything.
