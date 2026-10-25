---
title: "Dutch NLCIUS rules now run on CII invoices too"
date: 2026-10-25
description: "einvoice-preflight checks Dutch NLCIUS invoices in the UN/CEFACT CII syntax as well as UBL, with the official national rules."
tags: [einvoice-preflight, netherlands, e-invoicing]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) already ran the Dutch
NLCIUS national rules (BR-NL) on UBL files. Many Dutch ERPs and Factur-X
exports use the CII syntax instead, and those files got only the EU base.

The builder `build-nl-rules.mjs` now also compiles the official
`nlcius-cii-1.0.3.13.xslt` from the same Maven Central artefact: 34 national
checks next to the 39 for UBL. A CII file whose BT-24 names
`urn:fdc:nen.nl:nlcius:v1.0` gets them automatically.

Tested on made-up files only: a clean invoice passes with no skipped rule, and
a copy with a missing buyer reference, no seller street, payment code 10 and a
buyer country subdivision draws BR-NL-2, BR-NL-3, BR-NL-12 and the warning
BR-NL-28-2, each with an English fix. One thing the rules taught us: the
usual empty `ApplicableHeaderTradeDelivery` element draws the official
empty-element warning, so send a delivery date. No real Dutch invoice or
Digipoort verdict has been tried yet.
