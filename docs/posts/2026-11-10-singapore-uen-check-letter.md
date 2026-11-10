---
title: "Checking the Singapore UEN check letter on InvoiceNow invoices"
seo_title: "Singapore UEN validator: check letter for InvoiceNow invoices"
date: 2026-11-10
tags: [einvoice-preflight, tax-id, singapore, invoicenow]
description: "einvoice-preflight now verifies the check letter at the end of a Singapore UEN, not only its shape."
---

A Singapore Unique Entity Number ends in a check letter, and an InvoiceNow
supplier or buyer ID with a mistyped digit still looks plausible. The party
check now tests the letter for all three forms:

- **Business** (8 digits + letter): weights 10,4,9,3,8,2,7,1, sum mod 11 indexes
  `XMKECAWLJDB`.
- **Local company** (9 digits + letter): weights 10,8,6,4,9,7,5,3,1, mod 11
  indexes `ZKCMDNERGWH`.
- **Other entities** (R/S/T + 2 digits + 2-letter type + 4 digits + letter):
  alphabet-index weights 4,3,5,3,10,2,2,5,7, sum minus 5, mod 11.

A wrong letter reports INV-023, a wrong shape INV-022. GST numbers that start
with M are still checked for shape only.

**How it was checked.** I ran 3,000 random UENs (a third of each form) through
this code and through python-stdnum's `sg.uen`: 119 valid, no disagreement. The
tests use the library's documented examples (00192200M, 197401143C, S16FC0121D,
T01FC6132D). The previous test used a made-up number that turned out not to be
a valid UEN, so it was replaced. ACRA's own text is unread; this is the
open-source rule, not the authority's statement.
