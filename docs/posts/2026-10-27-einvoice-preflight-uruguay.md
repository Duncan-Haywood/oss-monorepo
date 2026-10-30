---
title: "E-invoice Preflight adds Uruguay, with a RUT check-digit test"
date: 2026-10-27
description: "A Uruguay mandate page with a local tax-number check, and the one sample the check rests on."
tags: [einvoice-preflight, e-invoicing, uruguay]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Uruguay](../../ventures/einvoice-preflight/uruguay-dgi-e-invoice-mandate.html), the 46th in the all-countries table.

Tax receipts in Uruguay are electronic (CFE, comprobante fiscal electrónico) in the format the tax authority, DGI, specifies. A December 2023 KPMG bulletin reports DGI resolutions making the CFE mandatory for all VAT taxpayers, including those on the minimum regime; a 2026 vendor guide says almost every VAT taxpayer is covered from 2025.

The page tests a RUT in the browser: 12 digits, the first eleven weighted 4,3,2,9,8,7,6,5,4,3,2, check digit 11 minus the sum mod 11 (11 read as 0). It rests on a single sample, Antel's RUT 21-100342-001-7 (sum 70, 70 mod 11 = 4, digit 7), from a forum thread and a vendor validator. 0 of 99 single-digit substitutions go unseen. What DGI does with a remainder of 10 is not stated by any source I found, so the page treats it as "no valid digit".

Not done: the resolutions, exact dates and exceptions are unread (search excerpts only), the legal basis is cited inconsistently (Resolution 798/012 versus Decree 36/015), and the checker cannot read a CFE. A summary, not tax advice.
