---
title: "Teaching tesseract Russian did not help it check a better engine's receipt totals"
seo_title: "Tesseract rus+eng as a second reading for Russian receipts"
date: 2026-11-18
description: "Tesseract's Russian model lifts its own vote on Russian receipt photos from 68 to 79 of 145, but adds no total behind RapidOCR's 140."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the total. It can read a photo with two engines: RapidOCR leads, and
tesseract reads the same photo four ways and votes. On the Russian receipt photos the venture
picked up today ([cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru),
MIT), RapidOCR has no Cyrillic model. It prints the word ИТОГ (total) as `HTOr` or `HTOI`, and
the parser has learned to read those look-alikes.

Tesseract does have a Russian model (`-l rus+eng`). So the obvious question was whether
tesseract, reading real Cyrillic, could act as a second opinion on the slips RapidOCR gets wrong.

## What we measured

On the validation split's 145 labelled totals:

| reading | totals right |
|---|---|
| RapidOCR alone | **140** |
| tesseract, four readings voting, English model (earlier today) | 68 |
| tesseract, four readings voting, Russian model | 79 |
| RapidOCR leading, tesseract's four Russian readings voting with it | 139, then **140** after a fix |

The test split's 148 totals said the same: RapidOCR alone 137, tesseract's four Russian readings
87, and the two together 136 before the fix and 137 after.

The Russian model helps tesseract, but not enough to matter. Most of tesseract's misses on these
photos are digits, not words. The photos are "enhanced" grey copies with heavy paper texture,
and tesseract reads `=13950.00` as `=7 3950` and an `=` sign as a `5`.

We also tried giving tesseract RapidOCR's row boxes, so it only had to read one line at a time.
That doubled how often it found the word ИТОГ (83 slips against 42), but the digits stayed
poor, and it added no correct total either.

## The one real bug

Behind RapidOCR, the vote lost one slip on each split that it should have kept. On one, a
tesseract reading saw a single 15.00 item and the card-payment line, `БЕЗНАЛИЧНЫМИ -00.00`. The
parser took that payment line as a second item worth 0.00, so the "items" added up to 15.00 and
seemed to confirm a total of 15.00. A total the receipt's own arithmetic confirms is allowed to
outvote the lead, so the right 300.00 was replaced. On the other, noise read as `0.00` beside a
fiscal number read as 974,115.90 did the same.

One item next to zeros adds up only to itself. That is no more a check than a single item, and
a single item never counted. So now the items check needs two items that are not 0.00, and the
Russian card and cash words are payments, not items, as `cash` and `card` already were. A first
version also dropped the "items plus tax" check and broke a real US receipt with a free
`No Beverage 0.00` line, so that part was put back. Totals on the hand-corrected CORD text and
RapidOCR's own scores did not move.

## What to run

For Russian receipt photos, `receipts photo.jpg --rapidocr` is still the advice. The extra
readings cost time and changed no total. The full numbers, the five slips RapidOCR still misses
and the one case where three tesseract readings were right and the lead was not are in
[the evaluation note](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-rus-vote-2026-11-18.md).
