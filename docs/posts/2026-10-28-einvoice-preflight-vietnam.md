---
title: "E-invoice Preflight adds Vietnam, with a tax code check anchored on a published example"
date: 2026-10-28
description: "A Vietnam e-invoicing page with a local tax-code check, and what the sources do and do not settle."
tags: [einvoice-preflight, e-invoicing, vietnam]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now has a page for [Vietnam](../../ventures/einvoice-preflight/vietnam-e-invoice-mandate.html), the 49th in the all-countries table.

Per secondary summaries (fiscal-requirements.com, vatupdate.com, Comarch, Vietnamese legal news), e-invoices have been compulsory for most taxpayers since 1 July 2022 under Decree 123/2020 and Circular 78/2021. An invoice either carries an authentication code from the tax authority (reference starts with C) or is issued without one (K) and reported the same day. Decree 70/2025 amended the rules from 1 June 2025 and added cash-register invoices for household businesses with revenue of VND 1 billion or more.

The page checks a tax code (mã số thuế) in the browser: the first nine digits weighted 31, 29, 23, 19, 17, 13, 7, 5, 3, check digit 10 minus the sum mod 11. The rule comes from the python-stdnum documentation, and it reproduces that library's example 0100233488 by hand (sum 167, remainder 2, digit 8). That makes this pin better than the Paraguay and Ecuador ones, which were hand-computed. When the remainder is 0 no digit fits, and the page says the number is invalid. Because 31, 29, ... are all coprime to 11, a single changed digit is always caught: 0 of 81 substitutions missed.

Not done: the decrees and the authority's pages were unreadable through the proxy, penalty amounts were not found in any excerpt so none is stated, and the checker cannot read Vietnam's XML. A summary, not tax advice.
