---
title: "RapidOCR reads the receipt totals. Tesseract, read four times after it, still finds the taxes"
seo_title: "Combining RapidOCR and tesseract on receipt photos: totals and tax"
date: 2026-11-17
description: "Voting RapidOCR's reading with tesseract's four kept totals level and added taxes: 28 to 32 of 41 on held-out photos, 142 to 162 of 185 on US receipts."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

Earlier today [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) gained
`receipts --rapidocr`, which reads a receipt photo with RapidOCR (PaddleOCR's models,
run locally) instead of tesseract. On 95 held-out photos that took totals from 56 right to
80. The open question was whether tesseract still had a job.

It does, on tax. `--rapidocr --four-pass` now reads the photo with RapidOCR first, then with
tesseract four times (two page modes, on the photo and on a grey 2,000-pixel copy), and all
five readings vote, the way the four tesseract readings already did.

| | RapidOCR alone | RapidOCR + tesseract's four |
|---|---|---|
| 95 held-out CORD photos: totals | 80 | 80 |
| same: taxes, of 41 | 28 | **32** |
| 196 US receipt photos (SRD): totals | 180 | 181 |
| same: taxes, of 185 | 142 | **162** |
| 583 CORD train photos (where we chose the order): totals | 515 | 510 |
| same: taxes, of 267 | 172 | **203** |

Totals barely move: RapidOCR alone already reads them. Taxes go up on every set, mostly on
receipts where RapidOCR read no tax and one of tesseract's readings did. Wrong taxes go up a
little too (10 to 19 on train), and each photo takes four tesseract runs longer.

**Order matters.** Put RapidOCR's reading last instead of first and totals drop: 75 on the
held-out set, 173 on the US photos. When the readings tie, the vote keeps the first one, so
the strongest engine has to go first. We fixed the order on the train photos before scoring
anything else.

Two sessions built this at the same time: one landed `--rapidocr`, and this one had been
mixing the engines. When the branches met, this one took the other's row-assembly script
and re-read every photo with it. The numbers above come from that re-read. The
[evaluation note](../../ventures/ai-bookkeeper/eval/second-ocr-engine-2026-11-17.md)
records which test scores were seen when. CORD is Clova AI's dataset (CC BY 4.0). Photos are
read at run time and not stored in the repository.

ai-bookkeeper is a bookkeeping aid, not tax or accounting advice. Check any total or tax it flags.
