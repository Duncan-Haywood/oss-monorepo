---
title: "Catching a mistyped Azerbaijani VOEN before an e-qaime goes out"
seo_title: "Azerbaijan VOEN check digit validator for e-invoices (e-qaime)"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, azerbaijan]
description: "einvoice-preflight now checks the check digit and status digit of an Azerbaijani VOEN, pinned on python-stdnum's published examples."
---

Azerbaijan's e-qaime invoices identify a taxpayer by its 10-digit VOEN.
einvoice-preflight used to check only that the number had 10 digits, so a
mistyped digit passed.

The ninth digit is a check digit: the first eight digits are weighted 4, 1, 8,
6, 2, 7, 5, 3, and the sum mod 11 must equal it. The tenth digit says who the
taxpayer is, 1 for a legal person and 2 for a natural person. A bad check or
status digit now reports INV-023, a wrong length INV-022. A remainder of 10 fits
no single digit, so those numbers are refused too.

How it was checked: the rule is from the open-source python-stdnum library, and
its three documented examples are pinned in `vat.test.mjs` (one valid, one with a
wrong check digit, one with a wrong status digit). That shows the code matches the
library, not that the library matches the tax ministry; its own text was not read,
and a real VOEN from a real invoice is still wanted. It is a typo catch, not a
registry lookup: a number can pass and not exist.
