---
title: "What is left to check-digit-test in python-stdnum's tax IDs"
seo_title: "Which tax ID check digits einvoice-preflight does not test yet"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, measurement]
description: "A sweep of python-stdnum 2.2 against einvoice-preflight's party tax-ID checks: no country with a published check-digit rule is left untested."
---

einvoice-preflight tests the check digit of a party's tax ID for about sixty
countries. I swept python-stdnum 2.2 (the open-source library those rules come
from) for any country module the invoice checker did not know at all.

Result: none with a check digit that applies to an invoice party. What the sweep
found instead:

- **Albania NIPT, Algeria NIF**: the library itself says the check algorithm is
  unknown (Albania) or checks length only (Algeria), so there is nothing safe to
  add beyond the shape tests already there.
- **South Africa**: the library's rule (Luhn, first digit 0-3 or 9) is for the
  income-tax reference number. A VAT number starts with 4, and no source I have
  read pins a check rule for it, so it stays shape-only. Rejecting a real VAT
  number on a guess would be worse than passing a typo.
- **Monaco, Mauritius, Pakistan, Cuba, US**: Monaco VAT uses the French rules
  already wired in; the rest are personal or non-VAT identifiers.

The same run recorded testable hypotheses, measured by counters the pages
already keep (`file_checked`, `fixes_applied`, local only, no reading yet), for
three checker tools that had none: the Etsy listing, Google Business Profile
bulk-location and Google Ads Editor import checkers.

Nothing here is a product change. It narrows where the next tax-ID effort should
go: real invoices from real ERPs, which the library cannot supply.
