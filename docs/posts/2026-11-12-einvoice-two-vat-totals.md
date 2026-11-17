---
title: "A Saudi e-invoice can state two VAT totals, and no rule checked they agree"
seo_title: "ZATCA e-invoice BT-111 vs BT-110: SAR tax total mismatch check"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Every SAR invoice under ZATCA states its VAT total twice, and no published rule checks the two agree. Now 17 of 17 planted mismatches are flagged."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent. Earlier today we made its repair button work on Saudi invoices, and measured it by planting 258 wrong amounts in ZATCA's 19 published example invoices, one at a time. The planting also showed something the repair can't fix on its own: 17 of those wrong amounts drew no finding from anything.

## The same tax, written twice

A UBL invoice can state its VAT total twice. BT-110 is the total in the invoice currency, in the `TaxTotal` that carries the per-rate breakdown. BT-111 is the total in the "VAT accounting currency", in a second `TaxTotal` with nothing but an amount. That second one exists for an invoice in euros that must account for VAT in, say, Danish kroner.

ZATCA asks for BT-111 in riyals on every invoice. So a Saudi invoice that is already in riyals writes the same VAT twice:

```xml
<cac:TaxTotal>
  <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>
</cac:TaxTotal>
<cac:TaxTotal>
  <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>
  <cac:TaxSubtotal>…</cac:TaxSubtotal>
</cac:TaxTotal>
```

Change the first 15.00 to 22.00 and you have an invoice that states two different VAT totals in the same currency. Before today it passed our built-in checks, ZATCA's cut of the EN 16931 rules, and ZATCA's 152 KSA rules, all as this tool runs them. None of them compares the two figures. All 17 planted mismatches went through with no finding. Whichever figure a buyer's system books, it disagrees with the other one.

## The check

The new rule, INV-059, fires when the second total is in the invoice's own currency and differs from the first by a cent or more. It names both figures and points at the repeat. The repair button already rewrites that repeat from the breakdown. A BT-111 in a *different* currency isn't compared, because checking it needs the seller's exchange rate.

The same check runs on CII files (XRechnung, ZUGFeRD, Factur-X), where the repeat is a second `TaxTotalAmount`.

## What we measured

On ZATCA's 19 example invoices, with every amount pushed off by 7, one at a time:

| | before | after |
|---|---|---|
| planted BT-111 mismatches flagged | 0 of 17 | 17 of 17 |
| all planted faults flagged by some rule | 241 of 258 | 258 of 258 |
| repaired files that draw a new rule | 0 | 0 |

On 141 files that their publishers list as valid (Peppol PINT for Australia/New Zealand and Singapore, the Dutch, Romanian and Portuguese national rules, and ZATCA), INV-059 fires on none.

One thing went wrong along the way. Our first "after" run said only 165 of 258 faults were flagged. The official rule sets need two npm packages, and without them the evaluation quietly ran our built-in checks alone. It now prints a warning when that happens.

## What this isn't

These are planted faults in published examples, not real invoices. We haven't run a real ERP's riyal export through it, and we don't know what ZATCA's own Fatoora portal says about a mismatched repeat. It may well reject it, and this check would then just tell you sooner. It's an offline check, not tax advice, and not an acceptance by ZATCA.

The code is MIT licensed in the [einvoice-preflight folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) (`taxcurrency.mjs`), with the numbers in its README under "BT-111 in the invoice's own currency".
