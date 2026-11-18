---
title: "A check-character test for Chinese unified social credit codes on e-invoices"
seo_title: "China USCC (social credit code) validator for e-invoices and fapiao"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, china, fapiao]
description: "einvoice-preflight now checks the 18-character unified social credit code of a Chinese party, not only its length."
---

A Chinese company's tax number is its 18-character unified social credit code.
The last character is a check character, so a typo in the other 17 is
detectable without any registry lookup.

einvoice-preflight now does that. For a `CN` party it requires 18 characters
from `0-9A-Y` (no I, O, S, V or Z), weights the first 17 by position
(1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28), and expects
the last character to be `(31 - sum mod 31) mod 31` in that alphabet. A wrong
character reports INV-023; a wrong length or alphabet reports INV-022.

What this is not: a registry lookup, and not proof the company exists. The rule
comes from the open-source python-stdnum library's account of the national
standard GB 32100-2015; the standard's own text was not read. The tests pin one
code from that library's documentation and one made-up code that passes the
rule. A real code from a real fapiao is still wanted.
