---
title: "The receipts page dropped every rupiah tax its five readings agreed on; now it keeps 205 of 267"
seo_title: "Receipt OCR: why the page lost rupiah taxes the readings agreed on"
date: 2026-11-17
description: "Writing a voted tax back as \"Tax 8728.00\" failed on whole-unit slips, so ai-bookkeeper's page silently kept RapidOCR's tax alone. Fixed: 177 to 205 of 267."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt photo five times on its
web page: once with RapidOCR in the browser, then four times with tesseract.js. The five readings
vote on the total and the tax, and the page writes the result into an editable text box, which is
then parsed again. Writing a number back as text is where this went wrong.

## How it showed up

The task was a fresh check: run CORD-v2's train shard 0 (200 Indonesian receipt photos the latest
rules had never seen) through both engines. The command line's vote added seven taxes to
RapidOCR's 63 of 85. The page added none: its tax score was RapidOCR's alone, to the receipt.

Running every other CORD photo set again, the page matched RapidOCR alone on tax everywhere:

| CORD photos, page tax right | before | after |
|---|---|---|
| train shards 1-3, of 267 | 177 | **205** |
| validation, of 47 | 36 | **41** |
| test (held out), of 41 | 28 | **31** |
| train shard 0, of 85 | 63 | **69** |

## Why

When the readings agreed on a tax the first reading missed, the page inserted a line
`Tax 8728.00` and kept it only if the text read back as the same tax. A rupiah slip prints
amounts like `8,728` with no decimals, and on such a slip `8728.00` does not parse back to 8,728.
The page then left the tax out without saying so. The total had had the same fault, fixed earlier
the same day; the tax path was missed. Now the page writes `Tax 8,728` in the slip's own style.
US receipts were unaffected: on 196 US photos nothing moved.

Two of the three taxes gained on the held-out test set are wrong. The command line's vote gets
the same three wrong, so the page now agrees with it, mistakes included.

## A 17,001 that was right

The same shard showed one more fault. A slip read `Subtotal 15.455 / PAJAK 10% 1.546 / Total
17,001`, then a card payment of 17,000. A rule meant for OCR misreads takes a whole-unit total
ending in `001` as a misread `000` when the slip prints that amount. Here the total really was
17,001, and the subtotal plus tax says so, but the arithmetic check did not know `pajak`
(Indonesian for tax) as a tax word. Now it does, and the misread rule stands aside when the
receipt's own sums confirm the total. That fixed one receipt in shard 0 and the same pattern in
shards 1-3 (totals 175 to 177 and 542 to 543).

Shard 0 found all three changes, so it no longer counts as unseen for them. The other sets
didn't inform the changes, and the held-out test set was scored once. The numbers, misses and
commands to reproduce them are in
[`eval/cord-shard0-lead-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/cord-shard0-lead-2026-11-17.md).
