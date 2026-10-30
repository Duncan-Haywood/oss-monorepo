---
title: "Checking Polish KSeF FA(3) invoices offline"
date: 2026-10-24
description: "einvoice-preflight now reads Poland's national FA(3) invoice format: NIP check digits, rate codes and the totals KSeF will reject."
tags: [einvoice-preflight, poland, ksef, e-invoicing]
---

Poland's KSeF has been mandatory for most VAT-registered businesses since
1 April 2026, and it does not take UBL or CII: it takes XML in its own FA(3)
schema. Until now [einvoice-preflight](../../ventures/einvoice-preflight/) said
so on its Poland page and stopped there.

It now reads an FA(3) file and checks what a schema alone cannot: the NIP check
digit of seller and buyer, the tax-rate code (`23`, `8`, `0 KR`, `zw`, `np I`...),
quantity times price against each line, each `P_13_n` net total against the
lines at that rate, the VAT against net times rate, `P_15` against everything,
and the PLN tax that a foreign-currency invoice must also carry.

The element names and totals come from the published FA(3) XSD. The example
invoice validates against it with `xmllint`. What is not done: the XSD is not
run inside the tool (element order and patterns), and no genuine FA(3) invoice
was available, so the rules are checked on one made-up invoice and a copy with
planted faults. A real file from the KSeF test environment is the next test.
