---
title: "Portuguese VAT codes the EU rules reject"
date: 2026-10-25
description: "Portugal's e-invoice profile admits VAT category codes (AA, RED, INT, NOR) that the EN 16931 code list refuses. einvoice-preflight now says so."
tags: [einvoice-preflight, portugal, e-invoicing]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) checks Portuguese UBL
invoices that name `CIUS-PT` with the EN 16931 rules plus AMA's own profile.

An open question from last time: do Portuguese lower-rate invoices pass the EU
base? Testing it on the example invoice, no. Replace `S` with `AA`, `RED`,
`INT` or `NOR` and the EU code-list rules BR-CL-17 and BR-CL-18 fail. Yet AMA's
published stylesheet has no BR-CL rule at all, and its own format rules and
`BR-AA-*` rules list exactly those codes as admitted.

So the two rule sets disagree, and nothing public says which one the tax
authority's receiver applies. The tool does not guess: it keeps the EU
failure and adds a note to it saying the profile accepts the code, that `S`
with the real rate is what the EU base accepts, and to ask the vendor or AT
which validator applies. One test pins it. A real invoice from a Portuguese
ERP would settle the question.
