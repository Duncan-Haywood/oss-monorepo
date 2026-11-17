---
title: "A section sign where the five should be: two OCR marks on rupiah receipts"
seo_title: "A section sign where the five should be: OCR on rupiah receipts"
date: 2026-11-16
tags: [ai-bookkeeper, receipts, ocr]
description: "Tesseract reads a leading 5 as a section sign and puts dashes before amounts on Indonesian receipts. AI Bookkeeper now reads through both; one more total right."
---

[AI Bookkeeper](../../ventures/ai-bookkeeper/) reads receipt photos four times and lets the
readings vote on the total. We test it on CORD, a public set of Indonesian receipt photos
priced in whole rupiah (52,000, not 52.00). This run fixed two small marks the OCR engine
leaves on those receipts.

## "§2,000" is 52,000

On one bubble-tea receipt the photo plainly says `TOTAL SALES 52,000`. Two of the four
readings came back as:

```
SUB TOTAL §2,000
TOTAL SALES §2,000
DEBIT BCA §2,000
```

Tesseract read the 5 as a section sign. The parser saw "2,000" and reported a 2,000 total,
and two readings agreeing on it outvoted the others. The fix is narrow: on a receipt priced
in whole units, a `§` glued to a grouped amount (`§2,000`, `§13,000`) is read as a 5. A
section sign is never printed there. A loose `§` with a space after it is left alone. Across the
400 validation readings the pattern turned up on exactly two receipts, and both totals
start with a 5.

## The dash before the amount

The same engine often prints a dash before an amount (`AIR MINERAL -7,000`). The parser
already ignored that dash on the cash and change lines. On a receipt where no reading found
a TOTAL line, though, it falls back on the largest amount on the page, and there the dash
still hid the number. One reading of a one-bottle-of-water receipt picked a stray "1088"
instead of 7,000. Now the fallback reads through the dash as well. A refund or discount is
never the largest number on a slip like that.

## What it moved

| CORD photos, four readings | validation totals | test totals (held out) |
|---|---|---|
| before | 65 of 98 | 53 of 95 |
| after | **66 of 98** | 53 of 95 |

The section-sign rule fixed one validation receipt. The dash rule fixed no total by itself,
since the water receipt was already right on the votes of the other readings. Now all its
readings agree, though.

The test set was scored once, at the end. No count moved, but one wrong answer changed. On
that receipt every reading lost the TOTAL line, and two of them had a dash before
`CASH 10,000`. Reading through the dash turned a wrong 8,181 into a wrong 10,000, the note
the customer handed over. The receipt is marked as a guess from the cash line, so it is
flagged for a check either way. We left it as it is rather than tune on held-out data.

Most of the remaining misses are bounded by the OCR itself: the right digits appear in none
of the four readings. Details and the reproduction steps are in
[`eval/cord-dash-section-sign-2026-11-16.md`](../../ventures/ai-bookkeeper/eval/cord-dash-section-sign-2026-11-16.md).
