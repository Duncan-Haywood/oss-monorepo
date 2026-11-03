---
title: "Saudi credit notes are Invoice documents, and a CreditNote root breaks the rules"
seo_title: "Saudi ZATCA credit notes are Invoice documents, not CreditNote"
date: 2026-10-25
description: "Adding credit notes to einvoice-preflight's ZATCA checks showed that the rules expect an Invoice root with type code 381, and misfire on a UBL CreditNote."
tags: [einvoice-preflight, zatca, e-invoicing]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) checks Saudi ZATCA
invoices with ZATCA's own published rules. Until now it had no credit note
example.

The first attempt used a UBL `CreditNote` root, as EU files do. Three EU-base
rules (BR-22, BR-CO-13, BR-S-08) fired on a file that was otherwise fine,
because they read `InvoicedQuantity` and `/ubl:Invoice/...` paths. The KSA
credit-note rules (BR-KSA-17 reason, BR-KSA-56 billing reference) did not fire
at all, because they match `InvoiceTypeCode = 381`.

ZATCA sends credit notes as an `Invoice` document with type code 381 (debit
notes: 383). Rebuilt that way, the example passes clean, and dropping its
billing reference and reason draws exactly BR-KSA-56 and BR-KSA-17.

Limits: the example is made up, no real ZATCA credit note or Fatoora verdict
has been tried, and debit notes have no example yet.
