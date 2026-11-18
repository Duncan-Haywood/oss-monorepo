---
title: "Exact cash and a bottle of water: testing a receipt fix on the photos it was written for"
seo_title: "Testing a receipt OCR fix on real photos: exact cash"
date: 2026-11-16
tags: [ai-bookkeeper, receipts, ocr]
description: "A rule that stopped AI Bookkeeper's receipt reader taking the cash handed over as the total fixed one photo and broke another. Here is the second fix."
---

Earlier today [AI Bookkeeper](../../ventures/ai-bookkeeper/) learned not to trust one kind
of guess. When a reading of a receipt photo loses the TOTAL line, it falls back on the
largest amount on the page, and on a cash slip that is often the note the customer handed
over. So a guess that sits on the CASH line now gets no vote when the four readings of a
photo vote on the total
([the earlier post](2026-11-16-the-largest-number-on-a-receipt-is-often-the-cash.md)).

That rule was written without the photo that prompted it, because the host serving CORD's
receipt photos refused the session. This evening it answered, so we read the 200
validation and test photos again and scored the rule on them.

## One fixed, one broken

The bread-shop receipt it was written for (validation-30: a total of 21,000 paid with a
50,000 note) now comes out right. Another receipt broke, so the score stayed at 64 of 98.

Validation-66 is one bottle of water:

```
AIR MINERAL   7,000
CASH          7,000
```

There is no total line. The customer paid exact cash, so the cash really is the total. One
reading guessed 7,000 from the item line and another from the cash line. With the cash-line
guess now worth nothing, a stray "1088" in a third reading won the tie.

The first version of the rule already had an exception for exact cash, but it only looked
at the receipt's arithmetic: subtotal plus tax equal to the cash. A single item has no
subtotal and no tax, so the exception never fired.

## The fix: is the amount printed anywhere else?

A guess on the cash line now keeps its half vote when any reading prints the same amount on
a line that isn't the cash line, such as an item or a total. On the bottle of water,
"AIR MINERAL 7000" does. On the bread-shop slip, 50,000 appears only next to CASH. Both
come out right: **65 of 98** validation totals.

## A tax tie, settled by a reading with no vote

The same run took on another validation receipt where two readings disagreed on the tax,
4,264 against 4,964, one vote each, so the tie went to the first. A third reading had
`TAX 10.00 2 4,964` but had lost the total, so it never produced a tax and never voted.
Ties are now broken by how many readings print the amount on a tax line. That gives
4,964 two to one and takes validation tax from 22 to **23 of 47** right (wrong 4 to 3).

## Holding the line

Both changes were chosen from validation receipts only. The test half was scored once, at
the end, and no receipt in it moved. The 200 US receipt photos from ExpressExpense, read
again with the command line's tesseract, stayed at 153 totals and 134 taxes, with the same
misses. Both rules only touch the vote across several readings, so receipts read from
clean text can't change.

The gains are small: one total and one tax out of a hundred photos. Most of the remaining
misses are photos where the total's digits appear in none of the four readings, which no
voting rule can recover. The next thing to fix is visible in this receipt, though: OCR read
"AIR MINERAL -7,000" with a dash, and the fallback skips amounts with a leading dash.

Notes, tables and commands: `ventures/ai-bookkeeper/eval/cord-cash-guess-2026-11-16.md`.
