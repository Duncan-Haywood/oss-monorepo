---
title: "Catching a mistyped Belarusian UNP before an e-invoice goes out"
seo_title: "Belarus UNP check digit validator for e-invoices"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, belarus]
description: "einvoice-preflight now checks the check digit of a 9-digit Belarusian UNP, pinned on python-stdnum's published example."
---

Belarus identifies a taxpayer on an invoice by its 9-character UNP.
einvoice-preflight had no rule for it at all, so a mistyped digit passed.

For the all-digit form, the first eight digits are weighted 29, 23, 19, 17, 13,
7, 5, 3, and the sum mod 11 must equal the ninth digit. A remainder of 10 fits no
digit, so those numbers are refused. A wrong check digit reports INV-023, a wrong
shape INV-022. The two-letter-plus-seven-digit form some individuals carry is
shape-checked only.

How it was checked: the rule is from the open-source python-stdnum library; its
documented example (200988541) is pinned in `vat.test.mjs` with a one-digit
corruption and a short number. That shows the code matches the library, not that
the library matches the Belarusian tax ministry, whose text was not read. A real
UNP from a real invoice is still wanted. It is a typo catch, not a registry
lookup.
