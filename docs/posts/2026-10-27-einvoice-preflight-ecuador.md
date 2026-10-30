---
title: "E-invoice Preflight adds Ecuador, with RUC and clave de acceso tests"
date: 2026-10-27
description: "An Ecuador SRI page with two local checks, and why a 49-digit key's check digit catches every single typo."
tags: [einvoice-preflight, e-invoicing, ecuador]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Ecuador](../../ventures/einvoice-preflight/ecuador-sri-e-invoice-mandate.html), the 48th in the all-countries table.

The tax authority, the SRI, authorises electronic receipts (invoices, credit and debit notes, withholding certificates, delivery notes). Each carries a 49-digit *clave de acceso*: date, receipt type, the issuer's RUC, environment, series, sequence, an 8-digit code, emission type and a modulo 11 check digit. Vendor guides say it doubles as the authorisation number.

The page checks two things in the browser. A RUC: 13 digits whose third digit selects the rule (modulo 10 for people, modulo 11 for public bodies and private companies). A key: the check digit, the date, the environment digit and the RUC inside it. I tested the key digit against every one of the 432 single-digit substitutions in a 48-digit example and none slipped through, because the weights 2 to 7 are never a multiple of 11.

What the checks rest on: open-source libraries and vendor guides, not the SRI's technical sheet, which I could not read. The sample RUC is a published company number I recalled from memory; it fits the rule, but I did not confirm it with the SRI. The page states no mandate dates or penalties because I read none. A summary, not tax advice.
