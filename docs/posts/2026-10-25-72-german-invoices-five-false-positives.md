---
title: "We ran our e-invoice checker on 72 official German invoices and found five false positives"
date: 2026-10-25
description: "The XRechnung test suite exposed five rules in our e-invoice checker that rejected valid invoices, from direct debits to credit balances."
tags: [einvoice-preflight, evaluation, e-invoicing]
---

E-invoice Preflight checks invoices before they go to a customer or a tax
portal. Our built-in rules had only been run on the 41 EN 16931 examples, so we
fetched a second public corpus: the KoSIT XRechnung test suite, 72 valid German
invoices in UBL and CII. They pass the official validator, so anything our rules
flagged beyond placeholder data was our mistake.

All 72 drew a finding. Five were real false positives:

- **Payment means code 68** (online payment service) was called undocumented. We
  held 13 codes; the standard allows the whole UNCL 4461 list.
- **Direct debits** were asked for the seller's IBAN. A debit names the buyer's
  account, so the rule was wrong.
- **Zero-rated lines (category Z)** were asked for an exemption reason. The
  standard says there is none.
- **Rounding amounts** (BT-114) were left out of the amount due.
- **Prepayments above the invoice total** gave a negative amount due, which the
  standard allows and we refused. We now accept it only when the arithmetic is
  stated: gross minus prepaid plus rounding.

What is left is mostly placeholder data (fake VAT ids, a literal "[BIC]") and
rules we kept on purpose, such as the missing payment reference. Details and the
counts per rule are in the README. The rules still have not met a real ERP
export, which is the next test.
