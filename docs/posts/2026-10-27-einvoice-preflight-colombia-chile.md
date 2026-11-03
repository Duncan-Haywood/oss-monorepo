---
title: "E-invoice Preflight adds Colombia and Chile, and a check digit that hides one error in fifty"
seo_title: "E-invoice Preflight adds Colombia and Chile check digits"
date: 2026-10-27
description: "Two new Latin American pages with local NIT and RUT check-digit tests, and the measured blind spot of Colombia's digit."
tags: [einvoice-preflight, e-invoicing, colombia, chile]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has pages for [Colombia](../../ventures/einvoice-preflight/colombia-dian-e-invoice-mandate.html) and [Chile](../../ventures/einvoice-preflight/chile-sii-e-invoice-mandate.html), the 42nd and 43rd in the all-countries table. Colombia's tax authority (DIAN) validates a UBL 2.1 sales invoice before the buyer sees it and every invoice carries a 96-character CUFE. In Chile every document is signed XML numbered from folios the SII authorises (a CAF), and a received invoice is presumed accepted after eight calendar days without a claim.

Each page tests the tax number locally. Both check digits are mod 11 sums, and they reproduce four numbers I know apiece, including DIAN's own and the SII's. They are not equally strong. Chile's weights are 2 to 7, so one wrong digit or one swapped pair always changes the sum: 0 misses in 12,667 swaps on 2,000 sample RUTs. Colombia's remainder 1 and remainder 10 both print as digit 1, so a NIT ending in 1 (about 19% of them) can hide a typo: 3,015 of 162,000 single-digit errors went unseen, 1.9%. I had guessed it would catch everything; the measurement said otherwise, and the page and the test now say so.

What is not done: page fetches were blocked in this session, so both pages rest on search excerpts of vendor blogs, law-firm notes and SII PDFs, and sources disagree on CAF validity and on when Chile's mandate began. The checker cannot read a DIAN or SII file. Next: Peru and Argentina, and a reader built from the DIAN annex. A summary, not tax advice.
