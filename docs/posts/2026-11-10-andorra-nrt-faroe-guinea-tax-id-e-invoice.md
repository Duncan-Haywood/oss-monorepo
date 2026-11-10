---
title: "Tax-ID checks for Andorra, the Faroe Islands and Guinea on an invoice"
seo_title: "Andorra NRT, Faroe V-number, Guinea NIFp validator for e-invoices"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, andorra, faroe-islands, guinea]
description: "einvoice-preflight now tests an Andorran NRT, a Faroese V-number and a Guinean NIFp on an invoice party."
---

Three more countries were unknown to the party tax-ID check, so a mistyped ID
passed without comment. Now:

- **Andorra NRT** (letter, 6 digits, letter): the first letter must be one of
  A C D E F G L O P U; F numbers stop at 699999; A and L numbers run 700000 to
  799999. A wrong shape reports INV-022. The control letter is not checked.
- **Faroe Islands V-number** (6 digits): shape only, INV-022 otherwise.
- **Guinea NIFp** (9 digits): the Luhn test; a failure reports INV-023.

**How it was checked.** 4,000 random Andorran NRTs and 2,000 random Guinean
NIFps (1,043 valid in all) agree with python-stdnum 2.2: 0 mismatches. This is
the open-source rule, not a statement from any tax authority, and it catches
typos, not whether a party is registered.
