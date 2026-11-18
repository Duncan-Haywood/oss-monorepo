---
title: "Re-scoring four receipt tax rules, and the VAT table they still read wrong"
seo_title: "Re-scoring receipt tax rules: VAT tables with a row per rate"
date: 2026-11-17
description: "Four receipt tax rules shipped unscored. Re-scoring them on WildReceipt found French and Dutch VAT tables where only the first rate's tax was kept."
tags: [ai-bookkeeper, receipts, ocr, tax]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the total and the tax. Earlier today a run added
[four tax rules](2026-11-17-four-receipt-tax-lines-htva-tua-vat-in-subtotal.md) written
from photos in WildReceipt's second training shard. It could not score them, because the
session could not reach Hugging Face, where the photos are. This session could. So we read
the shard and the held-out test set again, and scored three versions of the parser: before
the four rules, with them, and with one more change.

**What the four rules did.** On the shard they came from they add 3 taxes of 335. On the
held-out test they add 1 of 272. That is about what their write-up expected. They added no
totals.

**What they missed.** The re-score also showed three taxes read where WildReceipt has no
tax label. We looked at those photos. All three are real tax lines that the dataset never
tagged. One is a 0.00 on a voided slip, read correctly. The other two are the same shape,
a VAT table with one row per rate:

```
HT  TUA  TIC                       EXCT.BTW  BTW%  IncI.BTW
TUA5.50%  10.26  95'0  10.82       21,45  21%  4,50  25.95
TUA10.00%  9.07  0.91  9.98        9966  12%  11,95  111,50
TOTAL 20.80                        Totaal 137,45
```

The parser kept the first row's tax and stopped there: 0.56 of 1.47 on the French slip,
4.50 of 16.45 on the Dutch one. Each row checks itself, though (net plus tax is gross), and
the rows' gross amounts add up to the receipt total: 10.82 + 9.98 = 20.80, and
25.95 + 111.50 = 137.45. So when that holds, the tax is now every row's tax added. Two
smaller pieces make the rows readable at all. A line right under a table row is a table
row, even with no tax word (`TUA` is TVA bent by OCR). And a row whose net amount OCR lost
(`9966` for 99,55) is read when the gross at that rate gives the tax.

**Held out, before to now:** with all five OCR readings, the command line reads 207 → 209
taxes of 272, and the browser page 205 → 208. No right answer became wrong and no total
moved. The hand-corrected CORD text and SROIE's 626 receipts score exactly as before.

These are small gains, and that tells us something too. The WildReceipt training shards
are spent as development sets, and this was the third run to score its test set. What
would teach the parser more now is a fresh set of labelled receipts.

Numbers, commands and integrity notes:
[`eval/wildreceipt-rescore-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/wildreceipt-rescore-2026-11-17.md).
