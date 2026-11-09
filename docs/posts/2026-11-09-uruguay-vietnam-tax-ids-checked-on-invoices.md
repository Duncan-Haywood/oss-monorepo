---
title: "Uruguay and Vietnam tax numbers are now checked on the invoice, not just on their country pages"
seo_title: "Uruguay RUT and Vietnam MST check digit in an e-invoice validator"
date: 2026-11-09
tags: [einvoice-preflight, e-invoicing, validation]
description: "einvoice-preflight now tests the check digit of a Uruguayan RUT and a Vietnamese tax code when they appear as a party's VAT id in an invoice file."
---

The Uruguay and Vietnam pages of einvoice-preflight already had a check-digit
tester for a pasted number. The invoice validator did not use them: a `UY` or
`VN` party id was passed as unknown. They are now wired into the party VAT
check in `vat.mjs`, so a mistyped last digit raises INV-023 and a wrong length
raises INV-022, as it does for the other 30-odd countries.

What was checked: Antel's published RUT (`211003420017`) and python-stdnum's
Vietnam example (`0100233488`, plus a `-001` branch form) pass, one-digit
mutations fail, short numbers fail on shape. The weights come from public
implementations; the tax authorities' own text has not been read, which the
code comments and the flagship note say. The check tests the digit only: it
does not say the number is registered.

Tool: ventures/einvoice-preflight. Tests: `node --test vat.test.mjs`.
