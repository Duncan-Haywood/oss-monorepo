---
title: "Three OCR readings agreeing on a receipt total is not a check"
date: 2026-11-17
description: "Tesseract's four readings outvoted RapidOCR's right receipt total 19 times on 583 photos. Requiring the receipt's own arithmetic took totals from 526 to 542."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt photo several times and
lets the readings vote on the total: RapidOCR once, then tesseract four times (two page modes,
on the photo and on a grey enlarged copy). Earlier today that mode was measured against
RapidOCR alone on held-out photos, where it kept totals level and added taxes. This run made
the one measurement missing: tesseract's four readings of the 600 CORD train photos, about
100 minutes of CPU.

On those 583 labelled totals the vote did worse than the reading it leads: 526 right against
539 for RapidOCR alone. Going through the 21 receipts it lost, 19 had the same shape. RapidOCR
read `770,000`; two tesseract readings read `70,000`; the vote took `70,000`, with a note that
"most readings give" it and no check on the receipt confirms it. Or `31,500` read as `31,508` by
all four tesseract readings. Or `32,500` as `32,300` by three.

The readings are not independent witnesses. They are one engine looking at one blurry digit
four times, and when it misreads a `3` as a `6` it tends to do it in several readings at
once. Three agreeing readings sound like a majority; they are closer to one opinion. RapidOCR,
a different engine, reads these digits much better (539 totals to tesseract's 367).

## The change

When RapidOCR leads, a total that outvotes it is now taken only if the receipt's own arithmetic
confirms it: subtotal plus tax, cash less change, or a sum the vote derived from printed lines.
Otherwise RapidOCR's total stays, and the receipt says the readings disagreed and asks for a
look. Tesseract still decides the tax most of the time, which is what it was added for.

| set | RapidOCR alone | five readings, before | five readings, now |
|---|---|---|---|
| CORD train, 583 (rule chosen here) | 539 | 526 | **542** |
| CORD validation, 98 | 85 | 87 | 87 |
| CORD test, 95 (held out) | 83 | 83 | 83 |
| US receipt photos (SRD), 196 | 188 | 186 | 188 |

The honest reading of that table: most of the gain is on the set where the rule was chosen.
On validation it fixed three receipts and broke three; on the held-out test it changed nothing
from the command line and cost one total on the page; on the US photos it gained two totals
and lost two taxes. What it clearly does is stop the five-reading mode from losing totals to
RapidOCR alone. With it, reading a photo five times is never worse on totals than reading it
once, and it still finds more taxes (train 209 against 177 of 267).

Three variants were tried on train; the simplest was fixed before any other set was scored,
and the test set was scored once. Numbers, receipt ids and commands:
[`eval/lead-vote-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/lead-vote-2026-11-17.md).
