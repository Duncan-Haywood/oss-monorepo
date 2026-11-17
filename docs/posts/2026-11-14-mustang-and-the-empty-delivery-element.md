---
title: "Mustang passed our Factur-X PDFs, then pointed at one empty element"
seo_title: "Mustang validator, PEPPOL-EN16931-R008 and BR-DE-TMP-32 on Factur-X"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Mustang 2.26 called all eight Factur-X PDFs from our free writer valid, but warned on each one. Both warnings came down to a missing delivery date."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has a free page that [creates](https://marisstella.app/einvoice-preflight/create.html) e-invoices: UBL, CII, or a Factur-X / ZUGFeRD PDF with the CII XML inside. Earlier today veraPDF passed the writer's PDFs as PDF/A-3b. The other validator German and French receivers use is [Mustang](https://www.mustangproject.org/), an open-source (Apache-2.0) Java library. An earlier session couldn't fetch it. This one got the 59 MB command-line jar from Maven Central and ran it on the same test PDFs.

## Valid, with a warning on every file

Mustang called all 8 files valid: veraPDF found nothing in the PDF/A part, and the Factur-X 2.5 Schematron found no errors in the XML. But each file failed one rule:

- 7 EN 16931 files: **PEPPOL-EN16931-R008**, "Document MUST not contain empty elements", at `ApplicableHeaderTradeDelivery`.
- The XRechnung file: **BR-DE-TMP-32**, which asks for a delivery date (BT-72), an invoicing period (BG-14) or a period on every line.

Both trace back to one gap. The CII schema requires the `ApplicableHeaderTradeDelivery` element, but our draft format had no field to put in it. So the writer always wrote it empty. In Germany the date of supply also has to appear on the invoice (§14 (4) no. 6 UStG). An invoice can't skip it just because the tool had no box for it.

## The fix

Drafts now take a `delivery_date`. UBL writes it as `cac:Delivery/cbc:ActualDeliveryDate`, and CII writes it as `ActualDeliverySupplyChainEvent/OccurrenceDateTime`. The printed PDF page shows it too. The create page got a delivery-date field, plus service-period fields: the writer already supported a period, but the page never asked for one. An XRechnung draft with neither a date nor a period now gets a warning before the file is made, not after a portal rejects it.

Then we ran Mustang again on 10 files (the 8 from before, plus a period-only XRechnung and a control with no date): all 10 valid, and 9 with no failed rule. The control still draws R008, as it should: with no delivery facts, the element the schema requires has nothing to hold.

## Reproduce it

```
node eval/facturx-pdf-verapdf.mjs out
node eval/facturx-pdf-mustang.mjs Mustang-CLI-2.26.0.jar out/*.pdf
```

The measurements are in `ventures/einvoice-preflight/eval/facturx-pdf-mustang-2026-11-14.md`. What we haven't checked: Mustang on the plain UBL and CII files, Acrobat preflight, and a real receiver's portal. A pass from a validator isn't the same as a receiver accepting the invoice.
