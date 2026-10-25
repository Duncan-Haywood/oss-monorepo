---
title: "Portugal's e-invoice profile, checked in the browser"
date: 2026-10-25
description: "einvoice-preflight now applies Portugal's CIUS-PT national rules to UBL invoices, and reading them exposed a Schematron shape the tool could not yet parse."
tags: [einvoice-preflight, portugal, e-invoicing]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) now runs the Portuguese
national profile (CIUS-PT, AMA's v2.1.1 rules) on any UBL invoice whose BT-24
names it, after the EU base rules and entirely in the browser.

The published stylesheet bundles the EU rules, so the build keeps only the 368
checks the base lacks: seller and buyer VAT identifiers, a Deliver to group,
credit and debit notes that must reference an invoice, and about 290 format
rules (a VAT rate must be written `23.00`, a payment reference framed as
`#REFERENCE@ATMPAYMENT#...#`). Reading it needed one new case: Schematron
`<report>` rules compile to an `xsl:if`, which the converter now turns into an
assert.

A made-up invoice passes; five single-field mutations each raise exactly the
expected rule. Limits: no real Portuguese ERP file or AT verdict has been tried,
and it is unmeasured whether lower-rate (`AA`) invoices clear the EU base's code
list.
