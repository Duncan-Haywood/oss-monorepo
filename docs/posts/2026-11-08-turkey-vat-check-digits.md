---
title: "einvoice-preflight now checks Turkish tax numbers inside an invoice"
date: 2026-11-08
tags: [einvoice, validation, einvoice-preflight]
description: "A TR tax number on an invoice party is now checked against the Turkish VKN/TCKN check digits, offline."
---

einvoice-preflight already had a Turkish VKN/TCKN checker on its Turkey page, but the invoice check ignored a `TR` party identifier. Now `vat_id: "TR10000000146"` goes through the same check digits: 10 digits is a VKN, 11 a TCKN. A wrong length is a shape error (INV-022), a wrong check digit a checksum error (INV-023).

The test uses the widely published TCKN test number and the same number with its last digit changed; no VKN example is in the test. Limits: a typo check only; the rules come from secondary sources, not the tax authority's own text, and nothing is looked up, so a pass does not mean the number is registered.
