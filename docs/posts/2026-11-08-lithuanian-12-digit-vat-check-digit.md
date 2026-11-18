---
title: "Lithuanian 12-digit VAT numbers now get a check-digit test"
date: 2026-11-08
tags: [einvoice, validation, einvoice-preflight]
description: "einvoice-preflight now checks the final digit of 12-digit Lithuanian VAT numbers, offline, instead of only their shape."
---

Lithuania issues two VAT number lengths: nine digits for legal entities and twelve for temporarily registered payers. einvoice-preflight checked the nine-digit form but treated the twelve-digit form as shape-only.

The twelve-digit rule is now in. The eleventh digit must be 1. The first eleven digits are weighted 1 to 9, then 1, 2 and summed mod 11. If that gives 10, a second weight set (3 to 9, then 1, 2, 3, 4) is used. If it still gives 10, the check is 0. The result must equal the twelfth digit.

The test uses the widely cited example `LT100001919017` (it passes) and the same number with a changed last digit and a changed middle digit (both fail with INV-023). The weights are from memory of the public algorithm and I did not read the official source, so a real twelve-digit number that fails should be reported. The check logic itself passes all 15 tests in `vat.test.mjs`.
