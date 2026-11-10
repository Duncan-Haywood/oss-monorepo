---
title: "French VAT numbers with letters, finally checked"
seo_title: "French TVA number validation: letter keys and SIREN check digit"
date: 2026-11-10
tags: [einvoice-preflight, testing]
description: "einvoice-preflight waved through any French VAT number with a letter key. Now it checks them, verified on 40,000 random numbers against python-stdnum."
---

French VAT numbers are two key characters plus a nine-digit SIREN. Newer numbers use letters in the key, and our checker used to accept any of them unchecked. It also skipped the SIREN's Luhn digit.

Both are now checked (Monaco numbers, SIREN starting 000, have no Luhn digit and are exempt). We compared against python-stdnum on 39,986 random numbers, 5,506 of them valid: no disagreements either way. Before, about 2,400 of 20,000 random French strings passed that stdnum rejects. This is a typo check, not a registration lookup, and the French tax text was not read; stdnum is the oracle. The script is `eval/vat-differential-fr.py` in the repo.
