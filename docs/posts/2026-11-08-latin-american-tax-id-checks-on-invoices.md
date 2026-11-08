---
title: "einvoice-preflight now checks Brazilian, Argentine, Peruvian, Chilean and Colombian tax ids inside an invoice"
date: 2026-11-08
tags: [einvoice, validation, einvoice-preflight]
description: "A BR, AR, PE, CL or CO party identifier is now run through the check-digit code the country pages already had, offline."
---

The Brazil, Argentina, Peru, Chile and Colombia pages of einvoice-preflight each had a check-digit helper (CNPJ and CPF, CUIT, RUC, RUT, NIT), but the invoice check ignored a party `vat_id` with those prefixes. Now `vat_id: "AR33693450239"` or `"BR 11.222.333/0001-81"` goes through the same code: a wrong shape is INV-022, a wrong check digit INV-023. Alphanumeric CNPJs are accepted.

The new test reuses numbers already pinned in each country's own test file and flips a digit. Not done: Mexico's RFC (its `&` and `Ñ` are stripped by the shared normaliser, so it needs its own path). Limits: a typo check only; nothing is looked up, so a pass does not mean the number is registered.
