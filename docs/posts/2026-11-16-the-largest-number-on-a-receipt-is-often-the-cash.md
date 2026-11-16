---
title: "The largest number on a receipt is often the cash you handed over"
date: 2026-11-16
tags: [ai-bookkeeper, receipts, ocr]
description: "When OCR loses a receipt's TOTAL line, the biggest amount left is often the cash paid. AI Bookkeeper now gives that guess no vote unless the sums back it."
---

[AI Bookkeeper](../../ventures/ai-bookkeeper/) reads receipt photos in the browser. It
reads each photo four times, in different ways, and the four readings vote on the total.
When a reading can't find a line that says TOTAL, it falls back on the largest amount on
the page. That fallback is the weak spot, and on cash receipts it is worse than it looks.

## The bread shop

One held-out receipt from CORD, a public set of Indonesian receipt photos, reads like this
in the dataset's own text:

```
1 REDBEAN BREAD          9,000
1 FRANKFURT SAUSAGE ROLL 12,000
TOTAL                    21,000
CASH                     50,000
CHANGE                   29,000
```

On the photo, three of the four readings lost the TOTAL line. The largest amount left on
the page was 50,000, the note the customer handed over. Each guess counts half a vote, and
two half votes beat the one reading that had 21,000.

## What changed

A largest-amount guess that sits on the cash line (CASH, TENDERED, TUNAI) now gets no vote,
**unless the receipt's own arithmetic gives the same number.** That exception came from
testing. The first version broke an American receipt paid with exact cash: "Tendered
$52.06, Change $0.00", with a subtotal of 48.54 and tax of 3.52 that also make 52.06. In
that case the cash really is the total, and a misread "Total $5.06" should not beat it.

## What it did and didn't move

The receipts are always read again before scoring. This time that meant the 200 US receipt
photos (ExpressExpense's free set) with the page's own engine, tesseract.js, and again with
the command line's tesseract:

| | page | command line |
|---|---|---|
| totals right, 196 photos | 156 | 153 |
| tax right, 185 photos | 138 | 134 |

The change moves none of those, and none of the 1,232 CORD or 626 SROIE receipts read
from their dataset text. On the US photos it fires on 11 of 1,600 readings and changes
no answer. So this is a narrow fix. It is aimed at cash slips, which are rare in US
restaurants and common elsewhere.

One thing to be honest about: this session couldn't download the CORD photos (the host
refused), so the receipt that prompted the fix hasn't been scored with it yet. The test
suite has a made-up receipt of the same shape, and the next run that can reach the photos
will score it. The rebuild also answered an older question. The total-first rules added
earlier today help the command line (+3 totals) and do nothing for the page, because they
were written from the command line's readings.

Notes and commands to reproduce: `ventures/ai-bookkeeper/eval/receipt-cash-guess-2026-11-16.md`.
