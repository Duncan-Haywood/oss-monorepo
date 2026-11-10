---
title: "Typo-checking Dominican and Venezuelan tax IDs before an e-invoice is sent"
seo_title: "Dominican RNC and Venezuelan RIF check digit validator for e-invoices"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, dominican-republic, venezuela]
description: "einvoice-preflight now catches a mistyped Dominican RNC or cedula and Venezuelan RIF with their check digits, tested against python-stdnum on 900 numbers."
---

The Dominican Republic's DGII is phasing in mandatory electronic invoices (e-CF),
and a wrong buyer or seller tax ID is one of the cheapest faults to catch before
a file goes out. einvoice-preflight now checks two more families.

- **Dominican Republic:** a 9-digit RNC uses weights 7,9,8,6,5,4,3,2 with the
  check digit `(10 - sum mod 11) mod 9 + 1`; an 11-digit cedula passes the Luhn
  test. Twenty-two real RNCs that predate the rule are accepted, not flagged.
- **Venezuela:** a RIF is a type letter (V, E, J, P, G), eight digits and a check
  digit computed with weights 3,2,7,6,5,4,3,2 plus a value per letter.

A bad shape reports INV-022, a wrong check digit INV-023. Neither is a registration
lookup: a number can pass and still not exist.

How it was checked: the rules come from the open-source python-stdnum library
(the tax authorities' own texts were not read). On 900 seeded numbers, 88 of them
valid, the JavaScript and Python verdicts agree on every one, and 120 are pinned in
the test file. That shows the code matches the library, not that the library
matches the authority; a real e-CF and a real Venezuelan invoice are still wanted.
