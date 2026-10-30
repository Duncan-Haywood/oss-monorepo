---
title: "E-invoice Preflight adds Paraguay, with a RUC check-digit test"
date: 2026-10-27
description: "A Paraguay SIFEN page with a local tax-number check, and what the check does not rest on."
tags: [einvoice-preflight, e-invoicing, paraguay]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Paraguay](../../ventures/einvoice-preflight/paraguay-dnit-e-invoice-mandate.html), the 47th in the all-countries table.

The tax authority, DNIT (formerly the SET), runs the SIFEN, the national electronic invoicing system. Press reports (ABC Color, May 2026) say a resolution, RG 52, brings new issuers in by group, with start dates from 1 June 2026 to 1 September 2027, and a vendor calendar lists the six dates; suppliers to the State are reported as bound from 2 January 2026, though sources cite different resolutions for that rule.

The page tests a RUC in the browser: the base number's digits weighted 2, 3, 4, ... from the right, check digit 11 minus the sum mod 11, or 0 when the remainder is 0 or 1. That is the rule several open-source implementations describe. I could not read DNIT's specification or any registered RUC with a confirmed digit (the proxy blocked those hosts), so the test is pinned on a number I computed by hand, 80016875-5 (sum 171, remainder 6), and the page says so. On that base, 0 of 72 single-digit substitutions go unseen.

Not done: the resolutions and each company's group are unread, and the checker cannot read a SIFEN document. A summary, not tax advice.
