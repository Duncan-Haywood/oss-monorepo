---
title: "Three more VAT numbers that now fail on a typo: Cyprus, Malta and Northern Ireland"
seo_title: "Cyprus, Malta and Northern Ireland VAT number check digits"
date: 2026-11-08
tags: [einvoice-preflight, vat, e-invoicing]
description: "Our open-source e-invoice checker now catches a mistyped Cyprus, Malta or XI VAT number before the invoice goes out, instead of only checking its length."
---

A VAT number with one wrong digit is rejected by the buyer's system or the tax authority, and the invoice comes back days later. `einvoice-preflight` already checked the check digit for 25 countries. Cyprus, Malta and Northern Ireland (prefix XI) were still length-only, so a typo passed.

They now fail rule INV-023 on a bad check digit:

- **Cyprus:** eight digits and a check letter. The letter comes from a table applied to the odd-position digits, summed mod 26. Numbers starting 12 are refused.
- **Malta:** eight digits, where the last two are 37 minus a weighted sum of the first six, mod 37.
- **Northern Ireland (XI):** the same mod-97 test as the UK, which XI numbers share. Letter forms (GD, HA) stay shape-only.

Each is tested in JavaScript and Python on a published example number (CY10259033P, MT11679112, XI980780684) and on a one-digit mutation. The suites pass: 1,285 Node tests and 359 Python tests. The messages never echo the number.

Limits: the algorithms are the public ones, written from memory of the python-stdnum descriptions; no tax authority text was read (those hosts are unreachable from our build environment). The check catches typos. It does not tell you a number is registered, so use VIES for that.
