---
title: "Scoring a receipt reader on 626 real receipts: dates went from 11% to 97%"
date: 2026-10-25
description: "The ai-bookkeeper receipt reader had only seen agent-written receipts. 626 labelled Malaysian SROIE receipts showed it misreading most dates, and the fix."
tags: [ai-bookkeeper, receipts, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads a receipt's merchant, date
and total so it can match the receipt to a bank line. Its last real test set,
CORD, masks merchants and dates, so those two readers had never met a real
receipt.

SROIE 2019 has 626 Malaysian shop receipts with the company, date and total
labelled by hand. Scored on it, the reader got **11% of dates and 59% of totals**
right. The causes were plain:

- `09/01/2019` was always read month-first. Malaysian receipts are day-first,
  so it came out as 1 September. The reader now takes the order from another
  date on the page (a first field above 12), or from a locale marker (RM,
  SDN BHD, GBP), and otherwise keeps month-first but says it guessed.
- Dates written `12-01-19` or `2018/02/22` were not found.
- A GST summary table at the bottom repeated `TOTAL`, and lines like
  `TOTAL GST` or `TOTAL INCLUDES 6% GST` were read as the total.
- A printed `ROUNDING ADJ -0.01` was ignored, so the total was a cent off the
  bank line.

After the fixes: **dates 96.7%, totals 96.2%**, merchant exact 63.7% (93% right or
containing the label). CORD did not move (96 of 98 totals).

Limits: the text is the dataset's hand-corrected word boxes joined into rows, not
tesseract output. The labels also disagree with each other on rounding and on
brand against registered company name, so the merchant figure undersells the
reader. The script, `eval/sroie-receipts.mjs`, fetches the data at run time and
copies none of it.
