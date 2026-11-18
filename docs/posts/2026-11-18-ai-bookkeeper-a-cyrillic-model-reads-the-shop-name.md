---
title: "A Cyrillic OCR model read no more totals, but it read the shop's name"
seo_title: "Russian receipt OCR: a Cyrillic model finds the merchant"
date: 2026-11-18
description: "Swapping PaddleOCR's East Slavic recogniser into RapidOCR left Russian receipt totals unchanged and took the merchant from 0 to 71% right on held-out slips."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the merchant, the date and the total, so each receipt can be matched to a
bank line. On Russian fiscal slips from
[cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru) it already
got about 93-97% of totals right, using RapidOCR's default model. That model has no Cyrillic
letters, so it prints `ИТОГ` (total) as `HTOr` and a seller like `ООО "Лента"` as Latin
look-alikes or noise. The totals survived that because digits are digits. The names did not.

## The experiment

RapidOCR keeps text detection and text recognition in separate models, so the recogniser can be
swapped without touching anything else. PaddleOCR publishes an East Slavic PP-OCRv5 recogniser
(Apache-2.0, 7.9 MB, Russian, Ukrainian, Belarusian, Bulgarian and Latin), and an ONNX copy runs
in RapidOCR as it is. Two environment variables now pass it through:
`RAPIDOCR_REC_MODEL` and `RAPIDOCR_REC_KEYS`. It reads a photo in about the same 2 seconds.

Both models read the dataset's validation split (149 photos, used for development) and its test
split (151 photos, scored once at the end).

| on the held-out test split | default model | East Slavic model |
|---|---|---|
| totals right (of 148) | 137 | 137 |
| seller's name in the text (of 146) | 43 (29.5%) | 125 (85.6%) |
| item names in the text (of 459) | 81 (17.6%) | 379 (82.6%) |
| seller taken as the merchant, before the parser change | 0 | 0 |
| after | 16 (11.0%) | **104 (71.2%)** |

The comparison folds Latin look-alikes into Cyrillic before matching, so the default model gets
credit for `OOO` and `AO` wherever the letters are right.

## Totals: no gain, and the vote did not help either

The two models miss different slips. On val the default got `IMG_0821` wrong and the Cyrillic
model got it right, and the reverse on `IMG_0905`. So a vote of the two readings looked
promising. It gained nothing on either split. Where the two disagree, neither reading's arithmetic
(the items adding up to the total, or the card line matching it) confirms one side, and without
that a two-reading vote is a coin toss the lead rule rightly refuses.

## The merchant was a parser problem

With readable Cyrillic the seller's name was on the page for 86% of slips, and the parser still
took it on none. Its merchant rules came from Malaysian, Indonesian and US receipts: the first
line of Latin words that isn't an address, a phone number or boilerplate. A Russian slip opens
with `КАССОВЫЙ ЧЕК/ПРИХОД` and a shift number, so the parser picked `KACCA:0008`, `CHO: OCH` or
the tax service's web address.

Russian slips name the seller by its legal form: `ИП` for a sole trader, `ООО`, `АО`, `ПАО` and
so on. The new rule takes the first column that opens with one, matched on a folded copy because
the engines print `ООО` as `000`. A quoted name ends at its closing quote, so
`ООО "КЛАУДС БАР" 191036, г. Санкт-Петербург` stops before the address. The card terminal's bank
(`ПАО СБЕРБАНК`) and the fiscal data operator that relays the receipt to the tax service (ОФД)
also appear in that form. The first version took them on four val slips, so lines naming them are
skipped.

On the held-out test split that took the merchant from 0 to 104 of 146. Of the 42 still wrong,
half are slips where the name isn't readable in the photo at all. The rest are mostly misread
forms (`ИЛ` for `ИП`, `ЗДО` for `ЗАО`) and labels that name a brand the slip prints without a
form.

## A small cost, kept

The Cyrillic model sometimes reads `ИТОГ` as `НТОГ`, with a Cyrillic Н. Making that a total word
is right, but it cost one val total: on one slip the total's amount had drifted down a row, and
the ИТОГ line now carried the VAT figure. Test lost nothing. The change stays because the word is
what the slip prints. That slip's real problem is the drifting row.

## Why it matters for bookkeeping

A total alone matches a receipt to a bank line most of the time, but the merchant is what a person
checks, and what tells two 500-rouble lines apart. Item names are what an expense category is
read from. Both were noise on Russian slips and now mostly aren't. The setup is two `curl`s and two
environment variables (README, "Russian slips with a Cyrillic recogniser"). The browser page's own
OCR still loads only the default model, and that's next.

Details and every number:
[`eval/receipt-ocr-ru-eslav-2026-11-18.md`](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-eslav-2026-11-18.md).
