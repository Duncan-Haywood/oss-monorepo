---
title: "Saudi e-invoices put tax on every line, and our checker counted it twice"
date: 2026-11-12
tags: [einvoice-preflight, zatca, saudi-arabia, ubl, e-invoicing]
seo_title: "ZATCA line-level TaxTotal and prepayment lines in a UBL validator"
description: Reading every TaxTotal in a ZATCA invoice as the document's raised false tax errors on all 19 of ZATCA's good examples. Reading only the root fixed it.
---

`einvoice-preflight` checks an e-invoice before it is sent. It runs its own arithmetic checks, and for Saudi files ZATCA's published rules too. We test it on the good-case examples that the `phive-rules` project ships for each national profile. Those are files the rule authors say must pass, so any blocking finding on one is a fault of ours or a gap between rule versions.

When we ran ZATCA's 19 good examples today with the rule engine installed, all 19 had raised two of our own checks: the invoice tax doesn't match its lines (INV-018), and gross doesn't equal net plus tax (INV-017). Three also raised a tax-breakdown error (INV-038). An earlier run had silenced those findings by dropping all three checks whenever ZATCA's rules governed a file, and one file still failed. The silencing hid the cause.

The cause was in the reader, not the checks. A Saudi UBL invoice has tax in three places our reader didn't expect:

- **Every line carries its own `TaxTotal`** (ZATCA fields KSA-11 and KSA-12: the line's VAT and its amount including VAT). EN 16931 puts tax only at document level, and Peppol warns against line-level `TaxTotal` (UBL-CR-561).
- **The document tax appears twice.** ZATCA requires the VAT accounting currency to be SAR, so a SAR invoice repeats its tax total in a second `TaxTotal` with no breakdown.
- **A prepayment line keeps the advance's own tax.** An advance invoiced earlier is deducted on a line with quantity 0 and net 0.00. The advance's taxable amount and VAT sit in that line's `TaxTotal` (KSA-31 and KSA-32), at the rate in force when it was paid. In ZATCA's rate-change example that is 5%, against 15% on the final invoice.

Our reader collected every `TaxTotal` and every `TaxSubtotal` in the file. So the line amounts and the SAR repeat were added to the document tax, and the 5% advance became a second row of the document's tax breakdown.

The fix is to read only the `TaxTotal` elements directly under the invoice root. Where several are in the invoice currency and one has no breakdown, that one is the repeat and is skipped. Separate totals that each carry their own breakdown, one per tax scheme, are still added together. We also stopped asking for a breakdown row for a rate whose lines net to zero. The checker already accepted the reverse, a zero row with no line behind it.

Results on the same examples (phive-rules commit dfa902d):

- **ZATCA:** 19 of 19 files pass, up from 18, with all three suppressed checks running again.
- **Dutch SimplerInvoicing:** four false findings gone, three INV-038 and one INV-017/018 pair. One of them was in the example that exists to show a line-level `TaxTotal`.
- **Every other profile:** unchanged.

A new made-up invoice, an advance paid at 5% and deducted on a 15% invoice, passes ZATCA's own rules. The old reader raised all three findings on it. The same fix went into the Python package.

What's still untested: no real ZATCA sandbox invoice and no Fatoora verdict. All 19 examples come from the rule authors, not from a business. The UBL repair tool still counts line-level totals, so on a Saudi file it declines to recompute tax. That is safe, but it means the repair does nothing there. Details are in the venture README, under "A line's own TaxTotal is not the document's".
