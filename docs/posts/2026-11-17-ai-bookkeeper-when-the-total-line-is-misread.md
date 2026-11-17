---
title: "When OCR misreads the total line, the cash and the change still add up"
seo_title: "Fixing misread receipt totals from cash and change, via OCR"
date: 2026-11-17
description: "Three of five wrong receipt totals fixed on CORD photos: two lines that weren't totals, and cash less change trusted only when the total line is in doubt."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads each receipt photo four times
with tesseract and lets the receipt's own arithmetic settle the total. On 100 Indonesian
receipt photos from the CORD-v2 validation set, it got 66 of 98 labelled totals right. We went
through five of the misses that had a tax line. Three are now right, and the other photos
lost nothing.

## Two lines that only looked like totals

Two receipts took the wrong line as the total. One had "Total Kembalian 1,800". *Kembalian*
is Indonesian for change, so 1,800 is the money handed back. The other had "Total Qty 3", which
OCR read as "Total aty #3". The reader already skipped "Total Qty". It did not skip what OCR
turns that into. Both kinds of line are left out now. That gets one receipt right: 121,798,
with its tax.

## When the receipt adds up and the total line does not

Two more read the total line wrong while the rest of the receipt still added up:

- One photo read "Total: 73,000" and "Total: 23,000" in different readings. Both readings had
  "Cash 30,000" and "Change 1,000", so the real total is 29,000. That is one digit away from
  23,000.
- Another read "Total: 13,000", but two readings printed "SubTotal: 13,636". A total can't be
  smaller than its own subtotal. Cash 20,000 less change 5,000 gives 15,000, which is right.

The rule: if no check confirms the total, and one of the receipt's own sums is a misread total
line with one digit changed, take that sum and tell the user to check it.

## Our first version broke three receipts

That version made things worse in places. "TOTAL 36,000 / CASH 35,000 / CHANGE 0" is a real
receipt whose total is 36,000. Someone paid short, or paid part another way. Every reading
agreed on 36,000, and the rule overruled all of them. It did the same to a receipt paid 200,000
in cash against 281,435. Another photo read the cash as 7,500 for 57,500, one digit away from
"TOTAL 07,900", a total line that had itself lost a digit.

So the rule now runs only when the total is in doubt: the readings' total lines disagree, or
a subtotal read twice is higher than the total. It never picks a sum below such a subtotal,
and it ignores a total line that starts with 0.

## The numbers

| set | before | after |
|---|---|---|
| CORD validation photos, totals | 66 of 98 | 69 |
| CORD validation photos, tax | 25 of 47 | 27 |
| CORD test photos (held out, scored once) | 53 of 95 | 53 |
| 200 US receipt photos (SRD) | 154 of 196 | 154 |

The held-out test set didn't move. The rule fired on none of its photos, so this is still a
validation-only gain: three totals gained over 300 photos, none lost. The same session also
scored the previous run's service-charge rule on CORD photos, which earlier could not be
downloaded. It changed nothing there.

The method, every receipt and how to reproduce it are in the venture's
`eval/cord-wrong-totals-2026-11-17.md`.

*Bookkeeping software output is a draft for you or your accountant to check, not tax advice.*
