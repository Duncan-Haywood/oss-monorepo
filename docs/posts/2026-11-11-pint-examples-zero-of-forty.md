---
title: "Our checker failed all 40 of Peppol's own PINT examples"
seo_title: "Peppol PINT SG and A-NZ validation: billing-1@sg-1 and @aunz-1"
date: 2026-11-11
tags: [einvoice-preflight, testing, peppol]
description: "OpenPeppol's 40 examples for PINT Singapore 1.4.1 and A-NZ 1.1.3 all failed our e-invoice checker. Four fixes later, 39 pass, and the 40th has a real GST error."
---

The phive-rules project on GitHub ships the example invoices OpenPeppol publishes for each PINT release, and its own tests run them as files that must pass. So we ran our e-invoice checker over the current Singapore (1.4.1) and Australia/New Zealand (1.1.3) folders: 40 files. **None passed.**

The main cause was one line. Current PINT files name their profile `urn:peppol:pint:billing-1@sg-1` (or `@aunz-1`). The rules we loaded in October were the older release, which used `...poacc:billing:international:sg:3.0`, so a current invoice matched no PINT profile and got the European rules. Those reject Singapore's GST categories, so every SG file drew BR-CL-17 and every A-NZ file drew BR-CO-04. Anyone validating a real InvoiceNow or A-NZ invoice since then would have seen the same thing.

The fixes, each checked against the file that failed:

- **Load the current rules.** These are on Maven Central in `phive-rules-peppol-pint` 4.6.4: 170 shared PINT checks, plus 92 for Singapore and 74 for A-NZ. Each count matches the stylesheet's own assert count.
- **Floating point.** On five New Zealand files, `aligned-ibrp-004` said net price must equal gross price minus discount, and it did: 69.99 − 10.00 = 59.99. In binary floating point it comes out as 59.989999… Our runner already allowed for this, but only when the whole rule was a single equality, not when the equality sat inside an `or`.
- **Negative invoices.** On a line of −4 days at 400 per 2 days, with a −200 charge and a −100 allowance, the net is −900.00. We skipped the negative adjustments and expected −800. A −10% header charge was rejected because the percentage was below zero.
- **EU habits.** Our own checks treated the bank branch field as a BIC (in Australia it holds a BSB), didn't know Singapore's GIRO code `Z01`, and asked for EU exemption reasons on zero-rated GST lines. Under PINT those checks now step aside, and PINT's own rules apply.

**Result: 39 of 40 pass.** The 40th is a real error in OpenPeppol's example: Singapore example 07 adds a 2,300 SGD transport charge at 7% GST, but its tax total says 0.00 GST, so 161.00 is missing. The official rules let it through. Ours report it.

What this doesn't show: these are examples written by the people who wrote the rules, not invoices from a real business, and no Peppol access point has given a verdict on any of them. Japan, Malaysia, UAE and Oman PINT are in the same package but not loaded yet. Details and the script: the [einvoice-preflight README](../../ventures/einvoice-preflight/README.md) and `eval/phive-corpus.mjs`.
