---
title: "E-invoice Preflight adds Mexico: what a CFDI is and an RFC check-digit test"
seo_title: "E-invoice Preflight adds Mexico"
date: 2026-10-27
description: "A new Mexico page explains the stamped-XML CFDI model and tests an RFC's check digit in the browser, with the check's measured blind spot."
tags: [einvoice-preflight, e-invoicing, mexico]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Mexico](../../ventures/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html), the 40th in the all-countries table and the first in Latin America. Every Mexican tax invoice is a CFDI: XML that a SAT-authorised provider (a PAC) validates, stamps with a unique folio and reports to the tax authority. Version 4.0 is reported to require the customer's RFC, exact legal name, postal code and tax regime, which is why a mistyped RFC means a rejected stamp.

The page tests an RFC locally: length (12 for a company, 13 for a person), letters, the YYMMDD date and the check digit, a mod 11 sum over the first 12 positions. The code reproduces four RFCs I know, including SAT's own. I first assumed the digit would catch every single-character typo; the measurement said otherwise. Character values run up to 37, so 60 of 385 substitutions on a sample RFC leave the digit unchanged (about 16%). The page says so and the test pins the number.

What is not done: the page rests on vendor blogs, since SAT and the Resolución Miscelánea Fiscal were not read, and sources disagree on the 3.3 to 4.0 dates. The checker cannot read CFDI XML. Next: a reader built from SAT's published schema and catalogues, then Brazil's NF-e. A summary, not tax advice.
