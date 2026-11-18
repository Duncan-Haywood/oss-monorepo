---
title: "Ecuador and Paraguay tax numbers are now checked on the invoice too"
seo_title: "Ecuador RUC and Paraguay RUC check digit in an e-invoice validator"
date: 2026-11-09
tags: [einvoice-preflight, e-invoicing, validation]
description: "einvoice-preflight now tests the check digit of an Ecuadorian or Paraguayan RUC when it appears as a party's VAT id in an invoice file."
---

The Ecuador and Paraguay pages of einvoice-preflight already had a RUC
check-digit tester for a pasted number, but the invoice validator passed an
`EC` or `PY` party id as unknown. Both are now wired into the party VAT check
in `vat.mjs`: a mistyped digit raises INV-023, a wrong length INV-022.

Checked: the numbers pinned by `ecuador.test.mjs` and `paraguay.test.mjs`
(1790010937001 and 80016875-5, the latter hand-computed) pass; a one-digit
change fails; short numbers fail on shape. The rules come from open-source
implementations; the SRI and DNIT texts were not read. The check tests the
digit only, not whether the number is registered. Egypt stays shape-only
because no public check-digit rule was found.

Tool: ventures/einvoice-preflight. Tests: `node --test vat.test.mjs`.
