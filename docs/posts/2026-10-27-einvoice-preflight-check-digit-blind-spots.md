---
title: "Which tax-ID check digits miss typos? Seven rules, measured"
date: 2026-10-27
description: "Chile and Argentina check digits catch every single-character typo; Mexico's RFC misses about one in seven. Seeded measurement of seven e-invoice ID rules."
tags: [einvoice-preflight, check-digit, e-invoicing, testing]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now checks tax IDs for seven countries, and each has a check digit. They are not equally good at catching a mistyped character, so we measured it: `eval/id-blindspots.mjs` generates seeded random valid IDs, changes one character in every possible way, swaps every adjacent pair, and counts the typos that still pass.

| ID | single-character typo missed | adjacent swap missed |
|---|---|---|
| Chile RUT | 0% | 0% |
| Argentina CUIT | 0% | 0% |
| Brazil CNPJ (digits) | 0.03 to 0.04% | 0.11 to 0.15% |
| Peru RUC | 1.3 to 1.4% | 1.7 to 2.0% |
| Colombia NIT | 1.4 to 1.8% | 1.5 to 2.1% |
| Japan T-number | 2.0 to 2.1% | 2.0 to 2.2% |
| Brazil CNPJ (alphanumeric) | 5.9% | 5.7 to 6.1% |
| Mexico RFC | 14.5% | 0% |

Ranges are three seeds of 2,000 IDs. Why they differ: Colombia, Peru and Japan have two remainders that give the same digit, so an error that moves between them is invisible. Letters in the new Brazilian CNPJ and in Mexico's RFC take character values up to 42 and 37 under a mod 11 sum, so two different characters can differ by a multiple of 11. Mexico's swaps read 0% because moving a letter into the date or a digit into the name already fails the shape check.

Caveats: the IDs are synthetic, the rules are pinned to a few known numbers rather than read from each authority's specification, and this measures the arithmetic, not how people actually mistype. The practical reading is that a pass from the Mexican or alphanumeric Brazilian check is weak evidence, which the pages already say; now the number is on the record. Next: compare against real rejected invoices if any are ever shared.
