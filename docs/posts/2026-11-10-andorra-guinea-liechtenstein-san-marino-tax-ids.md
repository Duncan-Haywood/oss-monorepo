---
title: "Tax ID checks for Andorra, Guinea, Liechtenstein and San Marino on e-invoices"
seo_title: "Andorra NRT, Guinea NIFp, Liechtenstein, San Marino tax ID validator for e-invoices"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, andorra, guinea, liechtenstein, san-marino]
description: "einvoice-preflight now checks an Andorra NRT, a Guinea NIFp (Luhn), a Liechtenstein PEID and a San Marino COE on a party's tax ID."
---

These four countries were unknown to the party tax-ID check, so a mistyped ID
passed without comment. Now:

- **Andorra NRT** (letter, 6 digits, letter): the first letter must be one of
  A C D E F G L O P U; F numbers stop at 699999; A and L numbers lie between
  700000 and 799999. The control letter is not checked (the library has no rule).
- **Guinea NIFp** (9 digits): the last digit is a Luhn check digit.
- **Liechtenstein PEID** (4 to 12 digits) and **San Marino COE** (up to 5
  digits): shape only.

A wrong Guinea control digit reports INV-023, a wrong shape INV-022.

**How it was checked.** Rules from python-stdnum 2.2. 3,000 random 9-digit
strings give 326 valid Guinea verdicts, 0 mismatches against the library;
the library's documented Andorra and Guinea examples are pinned in
`vat.test.mjs`. San Marino's list of allowed 1 and 2 digit numbers is not
enforced. The authorities' texts are unread, so this is the open-source rule,
not an authority's statement.
