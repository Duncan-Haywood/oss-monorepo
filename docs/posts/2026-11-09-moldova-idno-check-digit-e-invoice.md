---
title: "Catching a mistyped Moldovan IDNO before an e-factura goes out"
seo_title: "Moldova IDNO check digit validator for e-invoices (e-Factura)"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, moldova]
description: "einvoice-preflight now checks the check digit of a Moldovan IDNO, tested against python-stdnum on 500 random numbers."
---

Moldova's e-Factura system identifies a company by its 13-digit IDNO. Until now
einvoice-preflight only checked that the number had 13 digits, so a single
mistyped digit passed.

The last digit is a check digit: the first 12 digits are weighted 7, 3, 1
repeating, and the sum mod 10 must equal the 13th. A wrong check digit now reports
INV-023 and a wrong length INV-022.

How it was checked: the rule is from the open-source python-stdnum library (the
State Tax Service's own text was not read). On 500 random 13-digit numbers, 46 of
them valid, the JavaScript and Python verdicts agree on every one, and three cases
are pinned in `vat.test.mjs`. That shows the code matches the library, not that the
library matches the authority; a real IDNO from a real e-Factura file is still wanted.
It is a typo catch, not a registry lookup: a number can pass and not exist.
