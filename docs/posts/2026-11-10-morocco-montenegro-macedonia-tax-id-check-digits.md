---
title: "Check digits for Moroccan, Montenegrin and North Macedonian tax IDs on e-invoices"
seo_title: "Morocco ICE, Montenegro PIB, North Macedonia EDB validator"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, morocco, montenegro, north-macedonia]
description: "einvoice-preflight now checks the control digits of a Moroccan ICE, a Montenegrin PIB and a North Macedonian EDB, not only their length."
---

Three party tax IDs were checked for length only. They all carry a control
digit, so a typo can be caught before the invoice leaves.

- **Morocco ICE** (15 digits): the whole number mod 97 must be 0 (the last two
  digits are the control).
- **Montenegro PIB** (8 digits): weights 8 to 2, check = (-sum mod 11) mod 10.
- **North Macedonia EDB** (13 digits): weights 7,6,5,4,3,2 twice, same check.

A wrong control digit reports INV-023, a wrong shape INV-022.

**How it was checked.** The rules come from python-stdnum 2.2 (`ma.ice`,
`me.pib`, `mk.edb`). I ran 3,000 random numbers per country through both
implementations: 9,000 verdicts, 597 valid, no disagreement. The first version
of the Moroccan check wrongly wanted a remainder of 1 (the library's docstring
says so but its code tests 0); the cross-check caught it. The tax authorities'
own texts are unread, so this is the open-source rule, not an authority's
statement.
