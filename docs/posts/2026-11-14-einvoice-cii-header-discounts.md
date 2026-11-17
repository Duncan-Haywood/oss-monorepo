---
title: "The invoice discount the repair would not touch"
seo_title: "Repairing ZUGFeRD and XRechnung CII totals with header allowances"
date: 2026-11-14
tags: [e-invoicing, zugferd, xrechnung, factur-x, einvoice-preflight, open-source]
description: "The CII repair gave up on any invoice with a header discount or charge. On 66 real ones it now recomputes 64 unchanged and restores 449 of 459 planted faults."
---

[einvoice-preflight](../../ventures/einvoice-preflight/) checks an e-invoice and, on request, repairs its arithmetic: line nets, each VAT group's basis and tax, and the totals. It edits only the numbers, in place, and leaves everything else in the file byte for byte. Earlier today it was [run over 529 real test-suite files](2026-11-14-einvoice-repair-on-real-files.md) for the first time. That run found a gap. For CII files (XRechnung CII, ZUGFeRD and the XML inside a Factur-X PDF), the repair gave up as soon as the document had a header allowance or charge. That means an invoice-wide discount, a freight charge or a packaging fee. Real invoices have these all the time. 66 of the 358 PDFs in that run were declined for this reason alone.

## What the rule is

In EN 16931 a header allowance or charge (BG-20, BG-21) has an amount and a VAT category and rate of its own. It moves only its own VAT group. That group's taxable amount (BT-116) is the line nets in the group, minus its allowances, plus its charges. The document's tax basis (BT-109) is the sum of the line nets (BT-106), minus the allowance total (BT-107), plus the charge total (BT-108). The UBL side of the repair already worked this way. The CII side now follows the same rule. ZUGFeRD EXTENDED's `SpecifiedLogisticsServiceCharge` counts as a charge, which is how the checker already read it.

A second gap appeared as soon as those files got through. Many of them state the tax total twice: once in the invoice currency (BT-110) and once in the VAT accounting currency (BT-111, for example EUR and GBP in KoSIT's 02.0x cases, or DKK and EUR in CEN example 5). The repair used to stop at "more than one TaxTotalAmount". Now it picks BT-110 by its `currencyID` and recomputes it. It leaves BT-111 as written and says so, because converting it needs the seller's exchange rate and the repair does not guess facts.

## Measured on real files

The test set is every CII document in the ZUGFeRD corpus, Mustang, KoSIT's XRechnung test suite and the CEN examples that has a header allowance or charge: 77 files, 66 distinct documents (`eval/cii-header-allowances.mjs`).

| | before | after |
|---|---|---|
| valid documents recomputed | 0 of 66 | **64 of 66** |
| of those, changed by the repair | n/a | **0** |
| seeded faults (one total +7.00) restored exactly | n/a | **449 of 459** |
| seeded faults repaired to a wrong value | n/a | **0** |

The 10 seeded faults that were not restored are declined, with the reason printed. Seven come from one Mustang migration sample that has a line with no quantity. Three come from CEN's XRechnung-O example, which is outside VAT (category O) and states no tax total at all, so there is no BT-110 to recompute. The broader 529-file run still changes only the same 2 files, and both are invalid as written. It moves no amount due.

The [PDF run](../../ventures/einvoice-preflight/eval/cii-header-allowances-2026-11-14.md) plants a wrong tax total in each real Factur-X PDF and checks the repaired file with qpdf. That run starts from 358 seeded PDFs. qpdf still passes all 358 repaired files. qpdf now reads the original XML back byte for byte from 314 of them, up from 248 this morning. Declines fell from 110 to 44, and none of the 44 is for an allowance: 32 have a line with no quantity or price, and 12 have sub-invoice lines.

## Limits

These files come from public test suites, not from a business's own exports. A test-suite sample is still the closest stand-in anyone can publish. veraPDF (PDF/A-3 conformance after the incremental update) has still not been run on the repaired PDFs.
