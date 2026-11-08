---
title: "Catching a mistyped Kazakhstan BIN before the invoice leaves"
date: 2026-11-08
tags: [e-invoicing, einvoice-preflight, kazakhstan]
description: "einvoice-preflight now checks the 12th digit of a Kazakhstan business identification number, pinned on a hand-computed number."
---

Kazakhstan's electronic invoices (IS ESF) name the buyer and seller by a 12-digit BIN or IIN. The last digit is a check. einvoice-preflight now computes it: the first eleven digits are weighted 1 to 11 and summed mod 11; a remainder of 10 retries with weights 3 to 11, 1, 2; a second 10 is invalid. A wrong digit raises `INV-023`, a wrong length `INV-022`.

Limits: the rule is the widely published one, not the revenue committee's own text, and the test uses a hand-computed number (040701200547), not a registered BIN. A pass is a typo check, not a registry lookup. A real BIN from a real invoice is wanted to confirm.
