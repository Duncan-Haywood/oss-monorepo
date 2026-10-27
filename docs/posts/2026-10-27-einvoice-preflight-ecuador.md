---
title: "E-invoice Preflight adds Ecuador, and a check digit that misses a quarter of typos"
date: 2026-10-27
description: "An Ecuador SRI page with RUC and 49-digit access-key tests, and why a 13-digit RUC lets many typos through."
tags: [einvoice-preflight, e-invoicing, ecuador]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Ecuador](../../ventures/einvoice-preflight/ecuador-sri-e-invoice-mandate.html), the 48th in the all-countries table.

The tax authority, the SRI, authorises invoices, withholding certificates and complementary documents: signed XML goes to its web services and each document carries a 49-digit access key. Press reports (Primicias, El Mercurio) say that since 1 January 2026 documents must be sent at the moment they are issued, where the window had been four working days, and that a resolution published on 28 July 2026 makes billing-software providers register in the RUC and issuers show a third-party provider's RUC on their documents. I read only press excerpts, not the resolutions.

The page tests a RUC by the kind of taxpayer (a person's cédula by modulus 10, a public body and a company by modulus 11) and the access key's modulus-11 digit. The rules are the ones open-source code describes; the three sample numbers are pinned on sums worked by hand, and the page says they were not looked up.

The measurement worth keeping: changing any one digit of a 10-digit cédula is always caught (0 of 90 missed), but in a 13-digit company RUC 26 of 117 single-digit changes pass, and 35 of 117 in a public body's, because the last three or four digits (the establishment number) are outside the check. A checker that wants to catch typos there needs the SRI's register, not arithmetic.

Not done: the technical sheet, the XSD and a real authorised document. A summary, not tax advice.
