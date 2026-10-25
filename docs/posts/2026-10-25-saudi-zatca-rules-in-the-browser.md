---
title: "Saudi ZATCA's 152 invoice rules, now checked in the browser"
date: 2026-10-25
description: "E-invoice Preflight now runs ZATCA's own BR-KSA validation rules on Saudi UBL invoices, read from the compiled XSLT, not retyped."
tags: [einvoice-preflight, saudi-arabia, zatca, e-invoicing]
---

Saudi Arabia's Fatoora wave 25 (taxable turnover above SAR 187,500) must
integrate by 1 February 2027, and the platform rejects an invoice on rules like
BR-KSA-40 (the VAT number must be 15 digits starting and ending with 3) or
BR-CO-17 (the VAT amount must match the rate). [E-invoice
Preflight](../../ventures/einvoice-preflight/) now runs those rules on a UBL file
whose `ProfileID` is `reporting:1.0` or `clearance:1.0`, offline, in the
browser.

The rules were not retyped. ZATCA's validation rules ship only as XSLT inside a
Maven Central artefact, in a generator shape our PINT and Romania readers did
not know, with hand-written loops and `choose` blocks around the asserts. A new
reader rebuilds each assert as one XPath and throws on anything it does not
recognise. Counting the asserts in the stylesheet against the ones we emit
caught a first pass that lost 4 of 152. fontoxpath also has no
`format-number`, so five of the VAT-arithmetic rules were being skipped until we
added it.

What this does not prove: the invoices we tested are made up from the rule
texts, not exported from ZATCA's sandbox, and one rule (BR-KSA-29) may be an
upstream namespace quirk. Both are listed in the README. Signing, the QR
payload and the hash chain are still not checked beyond being present.
