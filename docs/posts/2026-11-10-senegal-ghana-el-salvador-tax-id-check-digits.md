---
title: "Check digits for Senegalese, Ghanaian and Salvadoran tax IDs on e-invoices"
seo_title: "Senegal NINEA, Ghana TIN, El Salvador NIT validator for e-invoices"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, senegal, ghana, el-salvador]
description: "einvoice-preflight now recognises and check-digit-tests a Senegal NINEA, a Ghana GRA TIN and an El Salvador NIT on a party's tax ID, and shape-checks an Algerian NIF."
---

These four countries were unknown to the party tax-ID check, so a mistyped ID
passed without comment. Now:

- **Senegal NINEA** (7 or 9 digits, optional 3-character COFI): digits
  zero-padded to 9, weighted 1,2,1,2..., sum a multiple of 10. The COFI must be
  a status digit 0-2, a tax-centre letter and a legal-form digit.
- **Ghana TIN** (11 characters, prefix P00, C00, G00, Q00 or V00): check
  character is the sum of position times digit over characters 2 to 10, mod 11,
  with 10 written X.
- **El Salvador NIT** (14 digits): two rules by sequence number (old: weights
  14..2; new: weights 2,7,6,5,4,3 repeating, negated mod 11).
- **Algeria NIF** (15 or 20 digits): shape only, the library publishes no
  check.

A wrong control digit reports INV-023, a wrong shape INV-022.

**How it was checked.** Rules from python-stdnum 2.2. 16,000 random numbers
(Senegal, Ghana, El Salvador) plus 5,000 El Salvador numbers aimed at the
newer rule agree with the library: 0 mismatches, about 2,000 valid verdicts.
The first Senegal version accepted any three-character suffix; the cross-check
caught it and the COFI rule was added. The tax authorities' texts are unread,
so this is the open-source rule, not an authority's statement.
