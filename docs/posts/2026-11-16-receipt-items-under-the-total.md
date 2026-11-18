---
title: "What a receipt prints under the total, and why it broke our item split"
seo_title: "Splitting receipt line items with OCR: lines below the total"
date: 2026-11-16
description: "Summaries and tip tables printed under the total kept a bookkeeper from splitting receipts into items. One guarded retry fixed 116 held-out ones."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt into a merchant,
a date, a total and a tax. It also tries to split it into the things bought, so a
$16.56 lunch can be filed line by line. It keeps that split only when the items, the tax
and any tip add up to the total exactly. Anything else is refused, which is the safe
failure. This run set out to re-measure the command-line reader. It turned up a
refusal that was far more common than one photo.

## The photo

A Chicago taco receipt, read by tesseract 5.3.4:

```
1 Add Carnitas Taco $4.95
...
Net Total: $1485
IL Sales $1.52
MPEA Tax $0.15
Restaurant $0.04
TOTAL: $16.56
Food: $12.40
Beverage: $2.45
```

The reader already knew that "IL Sales" and "Restaurant" are taxes, because the subtotal plus
the three lines makes the total. But the item reader counted them again as things bought, and then
added the Food and Beverage lines printed *under* the total: the items came to $29.70 and
the split was refused.

## The fix, and the first version's mistake

Lines taken as taxes are now left out of the items. When the whole list still fails, the
lines above the first subtotal or total line are tried alone, under the same exact check.

The first version kept a split it should not have. On another photo no total line was read
at all, so the reader fell back on the largest amount on the page, which was the food
subtotal. The three items above it "closed" that guessed total perfectly. The retry now
runs only against a total read from an actual total line. The same pass caught OCR's
"Subtota]" being taken as an item.

## What it was really blocking

On the 200 US receipt photos the change keeps six more splits (42 to 48), each checked by
eye. It was written from those photos, so that figure is in-sample.

The held-out check is CORD, 1,000 Indonesian receipts with hand-corrected text that we did not
look at while writing the rule. There, splits went from 342 to 436 (train), 51 to 62
(validation) and 49 to 60 (test), and none was lost. Of the 116 new splits, 115 close the labelled total,
and the last has no labelled total. What had been blocking them was a whole family of lines
receipts print below the total: `ITEMS 1.00`, `DPP 46.636` (the tax base), `NET SALES`,
`TOTAL QTY 2 ITEM 2 PCS`, `CHARGE5 61,600`, a suggested-gratuity table.

One caveat: our CORD files keep only the total, subtotal and tax, so these splits are
checked by whether they close the total, not item by item.

## The command line, re-measured

The CLI's `--four-pass` reader had not been measured since the tax work. With the binary
installed it reads 150 of 196 totals right (76.5%, up from 147) and, measured for the
first time, 126 of 185 taxes (68.1%). The in-browser reader gets 138 on the same photos.
The 59 CLI misses are listed by photo in the
[eval note](../../ventures/ai-bookkeeper/eval/receipt-cli-four-pass-2026-11-16.md). Most of
the wrong ones are a single digit misread on the tax line, so that is where the next run
starts.
