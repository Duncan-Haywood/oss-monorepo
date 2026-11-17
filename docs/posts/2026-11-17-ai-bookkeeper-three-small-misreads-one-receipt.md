---
title: "Three small misreads on one receipt photo, and why each fix needed the others"
seo_title: "Receipt OCR: a lost C, a stray TL, a total under its own subtotal"
date: 2026-11-17
description: "One US restaurant receipt read 7.07 instead of 37.37. It took three narrow fixes to an open-source receipt reader, each useless alone, to get it right."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt photo four times with
tesseract: two page modes, on the photo and on a grey copy. Then the receipt's own arithmetic
settles what the total is. One of our 200 labelled US photos, receipt 1022, is printed cleanly:

```
SUBTOTAL:              29.88
15% SERVICE CHARGE:     4.48
Tax(8.75%):             3.01
SALES TOTAL:           32.89
TOTAL:                 37.37
CASH:                 100.00
CHANGE                 62.63
```

The reader settled on **7.07**. The four readings guessed 37.37, 7.07, 29.88 and 8.75, and
only one of them read a line with the word TOTAL on it: "aueges TOTAL: 7.07", with the 3 lost.
A total line wins a vote over a guess, so 7.07 won.

The receipt had plenty to say against that. We found three things in the way, and fixing any
one or two of them left the answer at 7.07.

**1. The change line lost its C.** The grey reading has `CASH: 100.00` and then
`HANGE 62.63`. Cash less change is 37.37, which would back the right total, but the reader
looked for the word `change`. It now also accepts `hange`. It does not accept a bare `ange`:
another receipt reads "Orange Crush" as `'ange Crsh`.

**2. A stray "tl" made the tax line a total.** Some tills print `TL` for total, so `tl` is one
of the reader's total words. The same grey reading has `Tax (8.75%): 44 Of tl Bit.`, and that
noise made the tax line its total line, at 8.75 with its own total-line vote. Now a `tl` that
comes after a tax word on the same line doesn't count.

**3. A total below its own subtotal.** The reading that said 7.07 also read
`SUBTOTAL: 29.88` above it. A total smaller than the subtotal in the same reading is suspect,
so that reading's total line keeps its vote as a reading but loses the extra point for having
a total line. That point goes only when some reading's cash less change is above the
subtotal, meaning the money handed over says more was paid. The first version had no such
condition. On Indonesian receipt photos (CORD) it moved two receipts that were already wrong
to different wrong answers, and turned one missing tax into a wrong one. A wrong tax is worse
than a missing one, because a missing tax makes the page ask. So the rule got narrower.

With all three, 37.37 is backed by cash less change in one reading and printed in another, and
it wins. The tax, 3.01, comes right with it.

## How much it moved

| Set | Before | After |
|---|---|---|
| ExpressExpense photos (200 US receipts), totals | 154 of 196 | 155 of 196 |
| same, tax | 134 of 185 | 135 of 185 |
| CORD validation photos (Indonesian), totals | 69 of 98 | 69 of 98 |
| CORD test photos (held out, scored once) | 53 of 95 | 53 of 95 |
| CORD dataset text, SROIE (Malaysian) text, the page's two-reading path | unchanged | unchanged |

One receipt out of 200. That is the honest size of it. The reader is now at the stage where
each wrong receipt is wrong for its own reasons, and a fix like this one is narrow by nature.
What makes it worth landing is that a receipt-by-receipt comparison shows nothing else moved, and each
of the three rules says something true about receipts in general: a change line is still a
change line without its first letter, a tax line is not a total, and a total doesn't come in
under its own subtotal.

The numbers, the commands to reproduce them and the lines each reading printed are in
[`eval/change-ocr-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/change-ocr-2026-11-17.md).
ai-bookkeeper is MIT licensed and runs in the browser. Its output is a bookkeeping aid, not
tax or accounting advice.
