---
title: "Fixing a Saudi e-invoice's arithmetic: 42 of 258 seeded faults to 257"
seo_title: "Repair ZATCA e-invoice totals: line VAT, prepayments, SAR tax"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Our UBL repair declined all 19 of ZATCA's example invoices. Now it puts back 257 of 258 faults we planted in them, and every repaired file passes."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent. It also has a repair button. Paste a UBL file with wrong totals and you get the file back with only the amount elements changed, recomputed from the lines, plus a list of every edit. It never picks a tax rate, a date or a party. Those stay for a person.

On Saudi invoices the button didn't work, and it didn't say why. We found out this morning.

## Zero of nineteen

ZATCA, the Saudi tax authority, publishes 19 example invoices that its own rules accept. We ran the repair on all of them. It didn't crash or make a bad edit. It declined the tax part on every one, which is safe but no use. Two things tripped it:

- **Every ZATCA line has its own `TaxTotal`.** It holds the line's VAT (KSA-11) and the line amount with VAT (KSA-12). The repair counted every `TaxTotal` in the file, saw more than one and stopped. A Saudi invoice in riyals also repeats the document tax in a second, subtotal-less `TaxTotal` (BT-111, the tax in the VAT accounting currency), so even the header-level count was two.
- **Most of the examples carry a document-level allowance**, often 0.00. The repair stopped at any header allowance or charge at all.

Earlier today we fixed the same line-`TaxTotal` mistake in the reader, so the *checks* stopped raising false errors on ZATCA files. The repair still had it.

## What it does now

The tax part reads only the root-level `TaxTotal` that carries subtotals. Document allowances and charges come off, or go onto, their own tax group's taxable amount, the EN 16931 way. A line's own allowances and charges go into its net. On a ZATCA file only, it also follows three of ZATCA's published rules:

- **KSA-12 is net plus KSA-11** (BR-KSA-51), so a wrong line VAT drags the line amount with it.
- **A prepayment line's VAT is its taxable amount times its rate** (BR-KSA-79). The taxable amount itself is a fact about the advance, and so is the prepaid amount. If those two don't add up (BR-KSA-80), the repair says so and changes neither.
- **A VAT figure within ZATCA's own tolerance stays as written.** ZATCA's rounding example sells something for 1,000.00 including VAT and writes 869.57 + 130.43. Strict rounding of 869.57 × 15% gives 130.44. ZATCA's cut of the EN 16931 rules allows 0.01 per invoice line, so that cent stays as written.

## How we measured it

The 19 examples are known to be right, so we could break them on purpose. `eval/repair-seeded.mjs` takes every amount the repair is allowed to recompute and pushes it off by 7.00, one at a time. It runs the repair on each broken file and compares the result with the original. That made 258 broken files.

| | Before | After |
| --- | --- | --- |
| Faults put back | 42 of 258 | **257 of 258** |
| Examples where the tax part ran | 0 of 19 | **19 of 19** |
| Repaired files with a rule finding the original didn't have | | **0 of 258** |

The last row runs our built-in checks and ZATCA's own rule sets on every repaired file. The one fault that didn't go back exactly is the rounding example's line VAT: seed it wrong and it comes back as 130.44, not 130.43. That still passes every rule. The repair just doesn't guess that the seller priced VAT-inclusive.

Better handling of allowances and charges also helped the Peppol PINT examples. Australia and New Zealand went from 140 to **270 of 270**. Singapore went from 27 to **158 of 164**. Two Singapore examples account for the misses. One doesn't add up in the file as published (a 7% charge with no 7% subtotal and 0.00 tax), so the repair declines it. The other writes its line amounts to six decimal places, which the repair keeps but can't rebuild digit for digit. The repository's own 14 clean UBL examples came back 147 of 147. Every clean file, Saudi or not, comes back byte for byte when nothing was broken.

## A gap the rules don't catch

Seventeen of the 258 broken Saudi files raised no finding at all, not from our checks and not from ZATCA's rules. All 17 had a wrong riyal repeat of the tax (BT-111) on an invoice that is already in riyals. ZATCA's rule BR-KSA-97 compares BT-110 with BT-111 only when the invoice is in another currency. When both are SAR, nothing checks that they agree. The repair now sets the repeat equal to the tax, and a check that flags it is next on the list.

## What it doesn't do

None of this has been run on a real Saudi business's invoice or a Fatoora response. The examples are ZATCA's, and the faults are ours. A real export from an ERP is the test that would tell us more. If you have one you can share with the names removed, the [feedback form](https://marisstella.app/feedback/) is the place.

The code is MIT licensed and runs on your own machine or server: `node repair-cli.mjs invoice.xml -o fixed.xml`. It is a preflight, not tax advice. Check a repaired invoice before you send it.
