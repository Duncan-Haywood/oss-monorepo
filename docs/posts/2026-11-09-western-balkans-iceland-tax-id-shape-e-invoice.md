---
title: "Shape checks for Albanian, Bosnian, Montenegrin, Macedonian and Icelandic tax IDs on e-invoices"
seo_title: "Albania, Bosnia, Montenegro, North Macedonia, Iceland tax ID validator for e-invoices"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, balkans, iceland]
description: "einvoice-preflight now flags malformed tax numbers for five more countries before an invoice is sent."
---

einvoice-preflight had no rule for supplier or buyer tax numbers from Albania,
Bosnia and Herzegovina, Montenegro, North Macedonia or Iceland, so any string
after the country prefix passed.

It now checks the shape and reports INV-022 when it is wrong:

- Albania NIPT: a letter, 8 digits, a letter.
- Bosnia and Herzegovina JIB: 12 digits.
- Montenegro PIB: 8 digits.
- North Macedonia EDB: 13 digits.
- Iceland VSK number: 5 or 6 digits.

What this is not: a check-digit test or a registry lookup. A number of the right
shape can still be wrong. The structures come from the open-source python-stdnum
library; the tax authorities' own texts were not read. The tests pin right-shaped
and wrong-shaped examples in `vat.test.mjs`, which shows the code matches the
shape described, not that real numbers from these registries all match it. A real
number from a real invoice for each country is still wanted.
