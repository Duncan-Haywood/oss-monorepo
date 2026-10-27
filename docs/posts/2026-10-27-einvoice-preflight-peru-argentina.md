---
title: "E-invoice Preflight adds Peru and Argentina: one check digit hides 1.9% of typos, the other none"
date: 2026-10-27
description: "Two more Latin American mandate pages with local RUC and CUIT check-digit tests, and what the digits can and cannot catch."
tags: [einvoice-preflight, e-invoicing, peru, argentina]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has pages for [Peru](../../ventures/einvoice-preflight/peru-sunat-e-invoice-mandate.html) and [Argentina](../../ventures/einvoice-preflight/argentina-afip-arca-e-invoice-mandate.html), the 44th and 45th in the all-countries table. In Peru a factura or boleta is signed XML that SUNAT, or an operator it licenses (an OSE), answers with a CDR receipt; a rejected voucher has no tax validity and must be reissued. In Argentina the issuer sends each invoice's data to ARCA (formerly AFIP) through WSFEv1 and prints the CAE it returns.

Each page tests the tax number locally. Both use the same mod 11 weights, and they reproduce one number each that I know, SUNAT's own RUC and ARCA's own CUIT. They differ in the edge cases. Peru writes remainder 10 as 0 and 11 as 1, so two remainders share digit 1, and 3,346 of 180,000 single-digit errors in a fixed sample went unseen (1.9%). Argentina gives remainder 11 digit 0 and leaves 10 with no digit at all, so such a number is never issued, and 0 of 163,170 single-digit errors were missed.

What is not done: no SUNAT or ARCA page was fetched, so both pages rest on search excerpts. Sources disagree on Peru's UBL version and sending deadline and on how long an Argentine CAE lasts (10 or 15 days); the pages say so. The checker cannot read a SUNAT or ARCA file. A summary, not tax advice.
