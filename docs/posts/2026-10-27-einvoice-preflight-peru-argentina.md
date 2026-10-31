---
title: "E-invoice Preflight adds Peru and Argentina, with RUC and CUIT check-digit tests"
seo_title: "E-invoice Preflight adds Peru and Argentina, with RUC and CUIT checks"
date: 2026-10-27
description: "Two more Latin American mandate pages, each with a local tax-number check, and what the sources do and do not settle."
tags: [einvoice-preflight, e-invoicing, peru, argentina]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has pages for [Peru](../../ventures/einvoice-preflight/peru-sunat-e-invoice-mandate.html) and [Argentina](../../ventures/einvoice-preflight/argentina-arca-e-invoice-mandate.html), the 44th and 45th in the all-countries table.

In Peru an invoice is a comprobante de pago electrónico regulated by SUNAT. SUNAT says issuing from its SEE-SOL portal is free; companies can also issue from their own system or through a service operator, and a factura goes to a buyer with a RUC. In Argentina the tax authority, ARCA (formerly AFIP), authorises each electronic invoice and returns a CAE; vendor guides say an invoice without one has no tax value, and ARCA runs a public check for received invoices.

Each page tests the tax number in the browser. Peru's RUC and Argentina's CUIT both use weights 5,4,3,2,7,6,5,4,3,2 over the first ten digits and a mod 11 check digit; they differ only in how a remainder of 10 or 11 is folded. The code reproduces SUNAT's own RUC and the tax authority's CUIT, plus a second CUIT I know. On each, 0 of 90 single-digit substitutions went unseen. The rule was not read from either authority's specification.

What is not done: page fetches were blocked in this session, so the pages rest on search excerpts of SUNAT presentations and vendor guides. The legal bases, the dates each taxpayer group had to comply and the exceptions are marked unsettled on the pages. The checker cannot read a SUNAT or ARCA file. A summary, not tax advice.
