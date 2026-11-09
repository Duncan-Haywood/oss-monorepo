---
title: "Catching a mistyped Russian, Canadian or Dominican tax id before the invoice goes out"
seo_title: "Check Russian INN, Canadian GST/HST number and Dominican RNC check digits"
date: 2026-11-09
tags: [einvoice-preflight, tax-id]
description: "The free e-invoice preflight now tests the check digits of Russian INN, Canadian business numbers and Dominican RNC party ids, offline."
---

A tax id with one wrong digit is a common reason an invoice is rejected or a
payment sits unmatched. The einvoice-preflight checker already tested the
check digits of about forty countries' ids. It now also covers three more:

- **Russia, INN**: 10 digits for companies, 12 for individuals, with one or
  two control digits (weighted sum, mod 11, mod 10).
- **Canada, business number / GST-HST**: nine digits with a Luhn check, and an
  optional `RT0001`-style program account.
- **Dominican Republic, RNC**: nine digits, weights 7,9,8,6,5,4,3,2.

A bad length is reported as INV-022 and a failed check digit as INV-023. It is
a typo catch, not a registry lookup: a valid number may still belong to no one.

What was checked: two real Russian numbers (a bank's 10-digit INN and a
12-digit example) pass and a last-digit change fails; the Canadian and
Dominican rules come from memory of the public algorithms, with the authorities'
own texts unread, and are tested on numbers computed by hand. Open: a real
invoice from each country.
