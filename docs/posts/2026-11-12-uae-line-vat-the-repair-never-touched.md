---
title: "UAE e-invoices state every line's VAT twice, and our repair button ignored the second one"
seo_title: "PINT UAE BTAE-08 and BTAE-10: repairing line VAT on UAE e-invoices"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "UAE e-invoices restate each line's VAT and amount payable. Of 76 we planted wrong in OpenPeppol's examples, the repair fixed none; now it fixes all 76."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent, and its repair button rewrites the arithmetic it can prove. To see how well the repair works, we plant wrong amounts in published example invoices that are known to be correct, one at a time, and count how many it puts back. On OpenPeppol's 32 examples for the UAE (PINT AE 2026.5) it put back 286 of 386. Of the 100 it missed, 76 were the same kind of amount.

## The second copy of a line's VAT

A UAE e-invoice line states its VAT in the usual place, and states it again under `cac:ItemPriceExtension`: the line's VAT (BTAE-08) and the line's amount payable (BTAE-10).

```xml
<cbc:LineExtensionAmount currencyID="AED">10486</cbc:LineExtensionAmount>
...
<cac:ItemPriceExtension>
  <cbc:Amount currencyID="AED">11010.3</cbc:Amount>      <!-- BTAE-10 -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="AED">524.3</cbc:TaxAmount> <!-- BTAE-08 -->
  </cac:TaxTotal>
</cac:ItemPriceExtension>
```

The repair left both as written, so a wrong 531.30 stayed wrong. And when we ran every planted file through the official UAE rules, none of the 40 wrong BTAE-10 amounts drew a finding, and only 11 of the 36 wrong BTAE-08s did. The UAE rule set requires both fields, and it requires BTAE-08 to be 0 on reverse-charge and zero-rated lines. It never checks that they add up.

## What the examples say the numbers are

All 40 example lines follow the same arithmetic. BTAE-08 is the net times the rate, and BTAE-10 is the net plus that VAT. The examples also keep whatever precision the arithmetic gives: 999.375 at 5% is written 49.9688, not 49.97. So the repair now rewrites a BTAE-08 that is more than 0.01 off net times rate (0 for reverse charge, zero rated and the UAE's margin scheme), and a BTAE-10 that is more than 0.01 off net plus VAT. It writes each one with the number of decimals the file already used there, between two and four. We picked the 0.01 tolerance ourselves; no UAE rule sets one. It keeps a VAT-inclusive price that comes out a fils under net times rate.

Two smaller faults turned up on the way:

- **Our measuring tool rounded the planted value.** It wrote every wrong amount with two decimals, so a planted 539.1645 became 539.16, and the precision the repair was meant to restore was already gone. Each planted value now keeps the decimals of the number it replaces.
- **Reverse charge at two rates.** Two examples put a reverse-charge discount at "AE 0%" next to lines and a subtotal at "AE 5%". Reverse-charge tax is 0 whatever rate is stated, but the repair grouped by category and rate, found two groups for one subtotal, and gave up on the whole tax part. Zero-tax categories now group by category alone.

## Results

Same planted faults, code before and after:

| Example set | Restored before | Restored after |
|---|---|---|
| PINT AE 2026.5 (32 files) | 286 of 386 | **380 of 386** |
| BTAE-08 and BTAE-10 alone | 0 of 76 | **76 of 76** |
| PINT OM, MY, A-NZ, SG, JP and ZATCA | unchanged | unchanged |

Every correct file still comes back byte for byte.

## Malaysia, left alone on purpose

Malaysia's PINT invoices also have an `ItemPriceExtension` amount. LHDN's 26 sample files write it as 100.00 on lines worth 5,000.00 and 6,000.00, and 0.00 on a 100.00 line, next to a comment that it "is not part of Schematron calculations at this moment". None of the line's numbers produces those values, so the repair has nothing to compute it from and doesn't try. We dropped those 42 from the planted set; they could never have been restored.

## Not done

We haven't had a real UAE business's invoice, or an accredited service provider's verdict on a BTAE-08 rounded to two decimals. The bigger gap is that a wrong BTAE-10 still gets past every check, ours included. The repair fixes it if you press the button, but nothing tells you to press it. That check is next. Details and the test list are in the venture's [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight#uae-line-vat-btae-08-and-line-amount-payable-btae-10-2026-11-12-later).
