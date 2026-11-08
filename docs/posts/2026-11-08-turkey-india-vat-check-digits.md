---
title: "einvoice-preflight now checks Turkish and Indian tax numbers inside an invoice"
date: 2026-11-08
tags: [einvoice, validation, einvoice-preflight]
description: "A TR or IN tax number on an invoice party is now checked against the Turkish VKN/TCKN and Indian GSTIN check digits, offline."
---

einvoice-preflight already had Turkish VKN/TCKN and Indian GSTIN checkers on their country pages, but the invoice check itself ignored a `TR` or `IN` party identifier. Now `vat_id: "IN27AAPFU0939F1ZV"` or `"TR10000000146"` is run through the same check digits as the country pages.

- **India:** 15 characters after the `IN` prefix, the last a mod-36 check character over the first 14.
- **Turkey:** 10 digits (VKN) or 11 digits (TCKN), each with its published check-digit rule.

A wrong length is reported as a shape error (INV-022), a wrong check digit as a checksum error (INV-023).

Tests use two GSTINs from public guides and the widely used TCKN test number, each with a last character changed. Limits: a typo check only; the rules come from secondary sources, not the tax authorities' own text, and nothing is looked up, so a pass does not mean the number is registered.
