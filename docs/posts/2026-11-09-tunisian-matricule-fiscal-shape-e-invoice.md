---
title: "What a valid Tunisian matricule fiscal looks like on an e-invoice"
seo_title: "Tunisia matricule fiscal format check for El Fatoora invoices"
date: 2026-11-09
tags: [einvoice-preflight, tunisia]
description: "The free e-invoice preflight now flags a Tunisian tax number whose shape cannot be a matricule fiscal, before El Fatoora does."
---

Tunisia's El Fatoora e-invoicing identifies businesses by their matricule
fiscal (MF). The e-invoice preflight tool now checks the shape of a
`TN`-prefixed MF: seven digits and a control letter (never I, O or U),
optionally followed by a VAT code (A, P, B, D or N), a category code (M, P, C,
N or E) and a three-digit branch number. A branch other than 000 is only valid
with category E, so `1234567MAM001` is flagged and `1234567MAE001` is not.

What it does not do: verify the control letter. The structure comes from the
open-source python-stdnum library; the rule behind the letter is not published
there and the Tunisian tax text was unread, so the tool says "wrong shape",
never "wrong letter", and a real MF should be tried against it. It runs in the
browser, nothing is sent, and it is not tax advice.
