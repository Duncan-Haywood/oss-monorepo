---
title: "Four receipt tax lines a parser missed: Total HTVA, a header read as TUA, VAT in a subtotal, and 0.00"
seo_title: "Four receipt tax lines a parser missed"
date: 2026-11-17
description: "How ai-bookkeeper now reads French HTVA totals, an OCR-bent TVA header, Philippine VAT printed in a subtotal line, and a zero tax on a zero receipt."
tags: [ai-bookkeeper, receipts, ocr, tax]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the total and the tax. On WildReceipt's second training shard an
earlier run left four tax shapes unread. Each one is a small habit of the receipts
themselves, not an OCR problem.

**`Total HTVA 69.06`.** On a French receipt "HTVA" means *hors TVA*, the amount before VAT.
The parser read "Total" and took 69.06 as the total. It now treats `Total HT` and
`Total HTVA` as a subtotal. Two VAT lines follow, at 10% (4.57) and 20% (4.67), so the
receipt's own arithmetic closes: 69.06 + 9.24 = 78.30, which is the label.

**`HT TIC TUA`.** This is a header row, HT / TTC / TVA, with two letters bent by OCR. The row
under it, `LOCAL 412.50 20% 495,00`, gives net, rate and gross, and OCR printed the two
amounts with different decimal marks. The parser now accepts a header that holds HT, a TTC
look-alike and a TVA look-alike. It reads such a row in either mark and takes the tax as
gross less net when 20% of the net gives it: 82.50.

**`Subtotal(12%VAT) Php32.14`.** Philippine receipts print the VAT inside the total on a
line labelled subtotal. 32.14 is exactly the VAT in a 300.00 total at 12% (300 / 1.12 =
267.86). The amount is taken as the tax only when that split matches to the cent. If it
doesn't, the line stays a subtotal.

**A 0.00 tax on a 0.00 receipt.** The parser drops a tax that is not below the total,
which kept it from reading a total line as tax. A voided slip has a zero total, so its
zero tax was dropped too. Now it is kept.

What we could not do: the photos' OCR readings are not in the repository, and this
session could not reach Hugging Face to fetch them. So the shard was not re-scored. Each
fix has a test in the photo's shape, including a case where it must *not* fire. On the
text corpora we could reach, nothing else moved: CORD validation, train and test, and
SROIE's 626 receipts score exactly as before. The details and the commands are in
[`eval/wildreceipt-tax-shapes-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/wildreceipt-tax-shapes-2026-11-17.md).
