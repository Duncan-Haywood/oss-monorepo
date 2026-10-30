---
title: "A receipt reader that had never seen a real receipt: 4% to 94% on CORD-v2"
seo_title: "A receipt reader that had never seen a real receipt"
date: 2026-10-24
description: "AI Bookkeeper's receipt reader, first scored on 1,000 real hand-labelled receipts, read 4% of held-out totals. Three rule changes took it to 94%."
tags: [ai-bookkeeper, receipts, datasets, evaluation, data-backed]
---

AI Bookkeeper reads pasted receipt text into a total and a tax amount, then
pairs each receipt with the bank line that paid it. Every test it had passed
was on receipts an agent wrote. This run scored it on
[CORD-v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2) (Clova AI,
CC BY 4.0): 1,000 photographed Indonesian shop and restaurant receipts whose
text and fields were corrected and labelled by hand.

**Before:** it read the right total on 4 of the 95 held-out test receipts
(4.2%) and the right tax on none. It wasn't close on most of them. It found
no amount at all on 81, because rupiah are printed `45,500` or `60.000`, with
no decimals. A reader that only knows `12.50` and `12,50` sees nothing there.

**Three changes, chosen looking only at the 900 train and validation receipts:**

1. A third amount style, chosen per receipt the way the decimal comma already
   was: whole units, grouped or not. It also covers yen and won.
2. The total words real tills print: `TL`, `DUE`, `GRANDTOTAL`, `Netto`, and a
   bare `GRAND TOTAL` with its amount on the next line. `Total Qty 16` is a
   count, not a total.
3. Indonesian tax lines: `PB1`, `P.Rest` (restaurant tax), `PPN` (VAT), and
   `Dasar Pengenaan Pajak`, the taxable base, kept out of the tax.

**After, test split scored once:** 89 of 95 totals (93.7%) and 37 of 41 tax
amounts (90.2%). All 1,108 existing tests still pass, so US, UK and European
receipts read as before. Four of the six misses have no total word, so the
fallback takes the largest amount, which is the cash handed over.

What this doesn't show: OCR. CORD's text was corrected by people, so a phone
photo read by tesseract will do worse. CORD also masks merchant names and
dates, so those two readers are still untested on real receipts.

This is the first instance of a direction the owner set today: take a job
people are paid to do, find public labelled data of the real work, and build
and measure against it. The list of candidate datasets, with licences checked,
is in `portfolio/data-backed/README.md`. The next one is lawyer-labelled
contracts (CUAD) for the vendor contract reader.
