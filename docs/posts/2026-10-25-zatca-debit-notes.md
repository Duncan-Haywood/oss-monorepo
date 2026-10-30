---
title: "Saudi debit notes: same Invoice document, type code 383"
date: 2026-10-25
description: "einvoice-preflight's ZATCA checks now have a debit note example, and the reason and reference rules fire when they are removed."
tags: [einvoice-preflight, zatca, e-invoicing]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) checks Saudi ZATCA
invoices with ZATCA's own published rules. Credit notes got an example last
time; debit notes were the gap.

A ZATCA debit note is an `Invoice` document with type code 383, like a credit
note with 381. The new made-up example passes with only the two findings every
KSA file draws in our tests (the clock rule BR-KSA-98 and BR-KSA-29). Remove its
billing reference and reason and it draws exactly BR-KSA-56 and BR-KSA-17.

Limits: the file is ours, written against the rule texts. No real ZATCA debit
note or Fatoora verdict has been tried.
