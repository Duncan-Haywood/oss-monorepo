---
title: "When the receipt loses its total, the card terminal's slip still has it"
seo_title: "Reading Russian receipt totals when the ИТОГ line is lost"
date: 2026-11-18
description: "On a fresh shard of Russian receipt photos, 18 of 25 misses had no total line. The bank slip printed under the receipt fixed five of them."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the total. Earlier today it learned to read Russian fiscal slips from
[cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru), an MIT set
of about a thousand phone photos. One shard of 233 photos was left unread on purpose, so the
next run would have a clean test.

## The clean number

We read that shard first, with the code exactly as it was, and scored it once: **196 of 221
totals right (88.7%)**. The previous clean shard read 88.3%. So the rules held on new photos,
and 88.7% is the honest figure for this engine on Russian receipts.

## What went wrong on the other 25

The OCR model has no Cyrillic, so "ИТОГ" (total) comes out as look-alikes such as `HTOr` or
`MTOr`. The parser already knew those. But on 18 of the 25 misses no total line gave it an
amount, and it fell back on the largest number on the slip. On a Russian receipt that is often
a tax-registration number read as a price, or the price before the discount.

On five of those slips the answer was printed further down. When you pay by card, the bank's
terminal prints its own slip under the receipt, and it says `СУММА (РУБ): 89.99`, the amount
the card was charged. The engine reads it as `CyMMa<Py6>`. Nothing had been looking for it.

## Two rules that looked right and weren't

The first try used the card line too ("БЕЗНАЛИЧНЫМИ 1828.00", paid by card) whenever the total
line was missing. On one café's slips the engine's rows run one line off, so the card line
carries the VAT figure instead (`=26.77` on a 562.00 bill), and seven slips that had been right
went wrong. The rule now takes the card line only when its amount is printed at least twice
on the slip.

The second try taught the parser one more misreading of ИТОГ (`HTOI`). It gained one slip and
lost two, because on those the amount beside it was misread as well. That one was dropped.

With both mistakes, the shard scored 193, worse than doing nothing. We only saw that because
every change was checked receipt by receipt against the shard: which slips it fixed and which
it broke.

## Where it ended

| | before | after |
|---|---|---|
| this shard, 221 totals | 196 | **202** |
| receipts whose labelled items add up to the total (202) | 181 | **185** |
| CORD's hand-corrected receipts (train, validation, test) | 767 / 97 / 94 | unchanged |

Six fixed, none broken. The changes were written from this shard's misses, so 202 is a
development figure, not a held-out one. The dataset has no unread photos left, and the 88.7%
above is the last clean number it can give.

What's left is mostly the OCR itself: metro tickets whose total line was never read, an amount
read backwards, amounts misread on the total line. A second engine reading the same photo
could vote on those, as it already does for the English receipts.

Numbers, commands and every miss: [`eval/receipt-ocr-ru-train2-2026-11-18.md`](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-train2-2026-11-18.md).
The photos are not copied into the repository.
