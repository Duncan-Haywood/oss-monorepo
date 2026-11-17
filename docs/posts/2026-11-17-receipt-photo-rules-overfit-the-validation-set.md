---
title: "Our receipt-photo rules were tuned to 100 photos. On 200 new ones they read 59%, not 70%"
seo_title: "Receipt OCR rules overfit a validation set: a fresh check"
date: 2026-11-17
description: "Every receipt-photo rule was chosen on 100 CORD validation photos. Unseen train photos read 59% of totals, not 70%. New rules: train 62%, test 58%."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt photo four times with
tesseract (two page modes, on the photo and on a grey 2,000-pixel copy) and lets the receipt's
own arithmetic settle the total: cash less change, subtotal plus tax, a vote across readings.
For two weeks of runs, each new rule was chosen by looking at the misses on the same 100
Indonesian receipt photos from CORD-v2's validation split. The test split was kept for a
single score at the end of each run.

That is a familiar trap. A set you look at every day stops being a fair measure. So this run
read 200 photos nobody had looked at: the first of CORD's four train shards.

## The numbers before any change

| photos, same code | totals right |
|---|---|
| CORD validation (where rules were chosen) | 69 of 98, 70.4% |
| CORD train, shard 0 (never seen) | 115 of 196, 58.7% |
| CORD test (held out) | 54 of 95, 56.8% |

The validation set was about 12 points optimistic. For a phone photo of an Indonesian
receipt, the honest figure is nearer 57-59%. The validation number had been quoted as if it
were the reader's real accuracy.

## What the new misses showed

Of the 81 wrong train totals, 49 have the right amount in none of the four readings. No
parser rule can fix those; the OCR never saw the digits. The other 32 had the total somewhere,
and the patterns were not the ones validation had shown:

- `SUB. TOTAL 22,727`: the dot between the words hid "sub", so the subtotal was read as the
  total.
- `Bayar 52.000` / `Kembali 30.000`: Indonesian for "paid" and "change". The reader knew
  `Tunai` (cash) but not `Bayar`, so the cash-less-change check never ran. A cut `Kembal`
  missed it too.
- `Total 10 4` read as a total of 4 rupiah. No rupiah receipt totals under 100, so a total
  that small now gets no vote.
- `8047000270`, a barcode, taken as the largest amount when no total line was read.
- `Qty: 3 Amount: 262,000`, a POS footer that is the total line.
- `Subtotal Rp 37,800` with the tax amount lost: Indonesian restaurant tax is 10%, so 41,580
  is a check on the total when a tax line is printed.

## After

| set | before | after |
|---|---|---|
| CORD train photos (the new development set) | 115 | 122 of 196 |
| CORD validation photos | 69 | 70 of 98 |
| CORD test photos, scored once | 54 | 55 of 95 |
| wrong test totals the page shows with no warning | 5 | 2 |
| SRD (US receipt photos) | 155 | 156 of 196 |
| CORD hand-corrected text, train / test | 749 / 92 | 761 / 93 |

The gain on held-out test photos is small, one total. The train gain did not carry over in
full, which is what you expect when rules are written from one shard. The useful result is
the corrected baseline: the reader is a 58% reader on unseen Indonesian phone photos, not a
70% one. Three-fifths of what is left is OCR, not parsing, so the next step is better
readings (a crop to the receipt's bottom third, where the total sits) checked on the other
600 train photos, with test still held back.

Method, every changed receipt and the commands to reproduce:
[`eval/cord-train-photos-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/cord-train-photos-2026-11-17.md).
CORD-v2 is Clova AI's, CC BY 4.0; the photos are fetched at run time and not copied into the
repository.
