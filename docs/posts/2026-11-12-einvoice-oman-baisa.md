---
title: "Thirty lines of 0.047 rials: rounding each line first gets an Oman e-invoice wrong"
seo_title: "PINT Oman e-invoice baisa rounding: line nets, line VAT, INV-014/018"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Oman invoices price lines to three decimals. Rounding each line first gave false totals; the repair even broke valid files. Now 49 of 49 examples pass."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent, and can repair the arithmetic. This morning it learned the Peppol PINT rules for Japan, Malaysia, the UAE and Oman. On OpenPeppol's 49 Oman example invoices, 45 passed. The other four were ours to fix.

## A baisa is a thousandth of a rial

The Omani rial divides into 1,000 baisa, so an Oman invoice line can be priced at 0.047 OMR. OpenPeppol's examples do exactly that, on purpose. One has thirty lines of 0.047 under totals written to two decimals:

| | stated |
|---|---|
| 30 line nets | 0.047 each |
| net total | 1.41 |
| each line's own VAT (5%) | 0.002 |
| tax total | 0.06 |
| rounding to the payable amount | 0.030 |
| payable | 1.50 |

Our checker rounded every line net to cents before it added them up. EN 16931, the European standard the checks started from, allows two decimals on a line, and at two decimals that rounding changes nothing. At three it does: thirty lines of 0.05 make 1.50, not 1.41. So the checker reported the net total, the tax total and the tax breakdown row all as wrong, on an invoice Oman's own rules accept.

The fix is to add the line nets as they're written and round only the sum. For any invoice with two-decimal lines, the European ones included, both methods give the same number. We checked that on 300 published example files from twelve rule sets: the four Oman files changed and nothing else did.

## Two ways to work out the VAT

Rounding was only half of it. The European rule computes VAT once per rate: 5% of 1.41 is 0.0705, so 0.07. Oman does it differently. Each line states its own VAT (field BTOM-016), and Oman's rule ALIGNED-IBRP-S-09-OM says the tax for the rate is the sum of those line amounts: thirty times 0.002, so 0.06. A cent apart, and both are sensible ways to round.

The checker now accepts either total when every line at that rate states its own VAT. It only uses the per-line sum if each line's VAT is within a cent of its net times the rate, so a file can't make a wrong total pass by stating wrong line VATs. One test states 0.020 a line, ten times too much, and the total still fails. A file with no line VAT gets only the European calculation, as before.

## The repair button was worse

The checker gave a false alarm. The repair button went further and edited a correct file to make it wrong. Given the thirty-line Oman invoice, it changed the net from 1.41 to 1.50, the tax from 0.06 to 0.08 and the amount due to match. It had the same rounding fault, and it also calculated VAT only the European way.

It now keeps a three-decimal line net as written, adds the nets before rounding, and keeps a tax that matches the sum of the lines' VAT. We measured it the way earlier repairs were measured: change one amount in a published example by 7, run the repair, see whether it puts the amount back.

| Oman examples | before | after |
|---|---|---|
| correct files the repair leaves unchanged | 45 of 49 | 49 of 49 |
| planted faults put back | 427 of 658 | 461 of 658 |

The Saudi (257 of 258), Australia/New Zealand (270 of 270) and Singapore (158 of 164) results didn't change.

## What's still open

Of the 197 Oman faults the repair doesn't put back, 125 are planted line VAT amounts. The repair leaves those as written, and Oman's own rule IBR-168-OM, which the checker runs, still flags them. The other 70 are three-decimal line nets that the repair writes back with two decimals. That's the next item.

One mistake on our side cost time. The script that scores the examples needs two npm packages to run the official rule sets. Without them it ran our built-in checks alone, scored Oman 0 of 49, and gave no warning. It warns now.

All of this was measured on OpenPeppol's published examples, not on invoices from an Omani business, and no Omani portal or access point has seen them. It's an offline check, not tax advice and not an acceptance by Oman's tax authority. The code is MIT licensed in the [einvoice-preflight folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) (`linenet.mjs`, `repair-ubl.mjs`), with the numbers in its README under "Baisa line nets and Oman's line VAT".
