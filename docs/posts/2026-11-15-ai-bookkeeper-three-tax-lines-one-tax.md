---
title: "Three tax lines, one tax: reading split taxes off receipt photos"
seo_title: "Reading split sales taxes off receipt photos with OCR"
date: 2026-11-15
description: "A Chicago taco receipt prints three taxes and OCR lost the word tax on two. How an open-source bookkeeper now adds them, and what it broke first."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos in the browser: four OCR passes over each photo, then the receipt's own arithmetic to settle what the total and the tax are. Today's slice was a shape every US hotel and many city receipts print: the tax split over two or three lines.

## The receipt

One photo in our labelled test set (200 free receipt photos from ExpressExpense, labels read by eye) is a taco order in Chicago. It prints:

```
IL Sales      $1.52
MPEA Tax      $0.15
Restaurant    $0.04
TOTAL:       $16.56
```

All four OCR readings got the amounts. Only the middle line says "tax". The reader took $0.15 as the tax, which is wrong by more than a dollar.

## The rule

Lines that touch a tax line, each with one amount, are added as taxes when a subtotal, or the items above them, plus their sum is exactly the total. Here the five items come to $14.85, and 14.85 + 1.52 + 0.15 + 0.04 is 16.56 to the cent. The receipt gets a note asking for a check, because it is still a guess.

Two more pieces came with it. A hotel bar receipt printed "Total: 43.60", then an 18% tip, then "Total 50.80": the subtotal plus its two taxes closes to the first total, not the last, so a total printed before a tip now counts. And on that photo the one reading that read both tax lines had lost the subtotal line, while the readings that had the subtotal misread one tax. The four readings now pool their evidence: one reading's tax lines added, checked against another reading's subtotal.

## What it broke first

The first version, run on 800 Indonesian receipts from the CORD dataset, broke seven taxes it had right. Those receipts print a service charge (`SC (3%)`, `Ser 5%`) or a rounding line (`Pembulatan 1`, "rounding") right below the restaurant tax, and they close the sum just as neatly. Then the US photos showed `Carry Out 1.93` beside `TAX: 2.31`. Service, rounding, fees, carry-out, bag and payment lines are now never part of the block.

## The numbers

| | before | after |
|---|---|---|
| US photos, tax right (of 185) | 136 | 138 |
| CORD, tax right (train / validation / test) | 322 / 46 / 41 | 322 / 46 / 41 |
| totals | unchanged | unchanged |

Two photos is a small gain, and both are in the set the rule was written from. The held-out check (CORD) shows that the rule stays quiet on a thousand other receipts. The two other split-tax photos in the set are lost to the OCR: the tax line is unreadable in every pass.

Full method and commands: [`eval/receipt-tax-lines-2026-11-15.md`](../../ventures/ai-bookkeeper/eval/receipt-tax-lines-2026-11-15.md).
