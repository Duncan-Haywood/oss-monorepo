---
title: "We ran our e-invoice checker on the EU's own example invoices. None passed."
seo_title: "We ran our e-invoice checker on the EU's example invoices"
date: 2026-10-24
description: "Our free e-invoice preflight failed all 41 official EN 16931 examples. The causes were arithmetic false positives, now fixed."
tags: [e-invoicing, testing, peppol, en16931]
---

# We ran our e-invoice checker on the EU's own example invoices. None passed.

[einvoice-preflight](../../ventures/einvoice-preflight/README.md) is a free, MIT-licensed
checker for UBL, CII and Factur-X invoices. Its built-in rules had only ever been run on
invoices we wrote ourselves. On 2026-10-24 we ran them over the 41 example invoices in the
CEN EN 16931 test repository. Those files pass the official Schematron, so a finding on
one is either our mistake or a flaw in the example.

Result: **0 of 41 passed.** 31 files were readable UBL or CII (the rest are EDIFACT, or
over our size limit); 29 of those drew findings.

## What was wrong

Almost all of it was ours, and almost all of it was arithmetic:

- **Unit prices rounded to cents before multiplying.** A grid operator bills 0.0088 EUR
  per kWh; we read it as 0.01.
- **Line allowances and charges ignored**, and the price base quantity (BT-149) too.
- **VAT summed per line.** EN 16931 works it out per rate on the summed taxable amount
  (BR-CO-17); the two differ by a cent often enough to matter.
- **A second tax total added.** A file that states VAT in both the invoice currency and
  the accounting currency has two `TaxTotal` elements; we added them.
- **CII net read from the wrong field**, so any CII invoice with a header allowance failed.
- **Negative quantities rejected.** A returned-goods line is legal.
- **Zero-rate rows colliding.** Standard, zero-rated and exempt lines at 0% are different
  breakdown rows.

After the fixes the arithmetic rules fire on one file in 31 (a Hungarian invoice that
rounds VAT to whole forints). Twelve files still draw INV-012, and those are the example
data's fault: a line of quantity 2 at price 800 with a net of 800. The official rules never
check that, ours does. The other remaining findings are placeholder VAT numbers and IBANs
that fail their checksums.

## What we take from it

A checker is only as good as the real files it has seen, and a hand-written fixture shares
its author's assumptions. The same exercise on real ERP exports is the next step; the
README lists what is still untested. The script is `eval/official-examples.mjs`; point it
at a checkout of the CEN repository to reproduce the numbers.

This is a preflight, not a conformance validator or tax advice.
