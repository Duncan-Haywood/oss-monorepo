---
title: "You received an XRechnung and it opens as code: how to read it"
seo_title: "How to open an XRechnung (XML invoice) you received, free"
date: 2026-11-28
tags: [for-customers, einvoice-preflight, e-invoicing, xrechnung, zugferd, factur-x, germany, accountants]
description: "Every German business must accept e-invoices since 2025, and an XRechnung is XML with no page. How to read one, field by field, with a free browser viewer."
---

Since 1 January 2025 every business in Germany must be able to *receive*
e-invoices; issuing them becomes mandatory from 2027 for businesses above
€800,000 prior-year turnover and from 2028 for everyone
([BMF FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)).
So the first e-invoice most small firms meet is one a supplier sends them.
If it is an **XRechnung**, there is no page to look at: it is an XML file,
and a double-click shows angle brackets.

## Two ways to read it, both free

- **The tax administration's viewer.** The BMF names the free
  E-Rechnungsviewer in the ELSTER portal (`e-rechnung.elster.de`) as one way
  to display an XRechnung.
- **Our viewer:** [XRechnung anzeigen](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/xrechnung-anzeigen.html)
  (German). Drop the XML, or a ZUGFeRD / Factur-X PDF, and it shows the
  invoice as a page. The file is read by JavaScript in your browser and not
  sent anywhere; no account. Its "Ansicht drucken" button
  prints the invoice; the print dialog can also save it as a PDF.

The printout does not replace the file. Keep the XML you received and ask
your tax adviser how to archive it.

## What you see, and what the field numbers mean

XRechnung and ZUGFeRD both follow the European standard EN 16931, which
numbers every field as a *business term*. Error messages, check reports and
suppliers' support desks name fields by these numbers, so the ones a
receiver meets most are worth knowing:

| Field | Term | What it is |
|---|---|---|
| Invoice number | BT-1 | the supplier's number for this invoice |
| Buyer reference / Leitweg-ID | BT-10 | your reference; for German public bodies, the Leitweg-ID |
| Seller VAT ID | BT-31 | the supplier's USt-IdNr. |
| Payment means | BT-81 | a code: 58 is a SEPA transfer, 59 a SEPA direct debit |
| IBAN | BT-84 | where to pay |
| VAT category | BT-118 | a code: S standard or reduced rate, AE reverse charge, K intra-EU supply |
| Amount due | BT-115 | what is left to pay after any prepayment |

The viewer shows the document type, the payment means and the VAT
category in words rather than as bare codes, and names the format the file
says it follows (XRechnung, Peppol, EN 16931).

The sample XRechnung bundled with the checker (two VAT rates and a part
payment) states 350.00 net, 38.00 VAT at 19% and 10.50 at 7%, 398.50
gross, 98.50 already paid and **300.00 due by 23.09.2026** by SEPA transfer;
the viewer shows those figures as the file states them.

## What it does not do

It is a display, not a check. Amounts appear exactly as the file states
them and nothing is recomputed. If you want to know whether the totals add
up and the file meets the XRechnung rules before you pay or book it, the
page's "Diese Rechnung prüfen" button opens our free checker with the
XRechnung rules selected
([what it checks](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/e-rechnung-pruefen.html)).

It reads UBL and CII invoices under EN 16931: XRechnung, Peppol BIS Billing,
ZUGFeRD from 2.0 and Factur-X. It does not read ZUGFeRD 1.0 or national
formats such as Italy's FatturaPA, and says so when given one.

## For accountants

A paid service for accounting firms, checking many clients' invoices at
once, explaining each broken rule in German, is being built. Nothing is on sale yet.

*Not legal or tax advice. Dates and thresholds as stated in the BMF FAQ
above; check its current wording.*
