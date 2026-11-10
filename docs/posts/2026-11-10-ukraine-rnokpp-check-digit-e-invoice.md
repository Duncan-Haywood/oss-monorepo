---
title: "A check-digit test for Ukrainian individual taxpayer numbers on e-invoices"
seo_title: "Ukraine RNOKPP (RNTRC) validator for e-invoices and sole-trader tax IDs"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, ukraine]
description: "einvoice-preflight now checks the check digit of a 10-digit Ukrainian RNOKPP, not only its length."
---

A Ukrainian sole trader or individual is identified by a 10-digit RNOKPP
(also written RNTRC). Until now einvoice-preflight only checked that a `UA`
party with 10 digits had 10 digits. The last digit is a check digit, so a typo
is detectable without a registry lookup.

The rule: weight the first nine digits by -1, 5, 7, 9, 4, 6, 10, 5, 7, sum
them, and the check digit is `(sum mod 11) mod 10`. The sum can be negative
(a first digit of 9 followed by zeros), so the code takes a true modulo, as
Python does, not JavaScript's signed remainder. A wrong check digit reports
INV-023; a wrong length reports INV-022. The 8-digit EDRPOU of companies keeps
its own, separate test.

What this is not: a registry lookup, and not proof the person exists. The rule
comes from the open-source python-stdnum library (`ua.rntrc`); the tax
service's own text was not read. The tests use the two numbers in that
library's documentation (1759013776, 2530414071) plus computed variants,
including the negative-sum edge. A real RNOKPP from a real invoice is still
wanted.
