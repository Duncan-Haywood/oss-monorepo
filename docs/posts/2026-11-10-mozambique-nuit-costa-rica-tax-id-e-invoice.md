---
title: "A check digit for Mozambique's NUIT and a shape test for Costa Rican tax IDs"
seo_title: "Mozambique NUIT and Costa Rica tax ID validator for e-invoices"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, mozambique, costa-rica]
description: "einvoice-preflight now check-digit-tests a Mozambique NUIT and shape-checks a Costa Rican tax ID on an invoice party."
---

Neither country was known to the party tax-ID check, so a mistyped ID passed
without comment. Now:

- **Mozambique NUIT** (9 digits): the first eight digits weighted 8,9,4,5,6,7,8,9,
  summed, mod 11, looked up in `01234567891`; that must equal the ninth digit.
  A wrong digit reports INV-023.
- **Costa Rica** (9 to 12 digits: cedula fisica, juridica, NITE or DIMEX): shape
  only, INV-022 on a letter or a wrong length. The library's cedula juridica
  component rules were left out because a 10-digit NITE shares that length.

**How it was checked.** 4,000 random NUITs (1,516 valid) agree with
python-stdnum 2.2: 0 mismatches. The library's two documented numbers are pinned
in tests. The Mozambican and Costa Rican tax authorities' texts are unread, so
this is the open-source rule, not an authority's statement.
