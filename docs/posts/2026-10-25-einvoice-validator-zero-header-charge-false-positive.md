---
title: "A valid German e-invoice that our validator rejected: the zero-amount header charge"
date: 2026-10-25
description: "Running einvoice-preflight over KoSIT's 72 valid XRechnung test documents found a false positive in six of them. Here is the cause and the fix."
tags: [einvoice, xrechnung, validation, open-source]
---

KoSIT, the German body behind the XRechnung validator, publishes 72 valid test
invoices. Any finding our checker raises on them is a false positive, placeholder
data or a style note.

Six of them drew `INV-038` ("tax breakdown row names a rate no line uses").
Each carries a header allowance or charge with an amount of 0 in VAT category E.
EN 16931 then lists a tax subtotal of 0 taxable and 0 tax for that category,
though no invoice line uses it. The arithmetic holds (0 x rate = 0), so the
document is fine and our rule was wrong.

The rule now accepts a zero row with no matching line. A non-zero row with no
line is still flagged. The JS and Python rules agree, and the KoSIT run drops
from six `INV-038` files to none. The remaining findings there (placeholder VAT
ids and IBANs, a style note on remittance references) are in the README.

Try it free in the browser, with no upload:
https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/
