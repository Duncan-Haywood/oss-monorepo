---
title: "Malaysia's tourism tax has no percentage, and our checker kept asking for one"
seo_title: "PINT Malaysia tourism tax (TTX, AAL) e-invoice: flat per-night tax check"
date: 2026-11-13
tags: [einvoice-preflight, ventures]
description: "A hotel invoice under PINT Malaysia carries a flat 10 MYR a night tourism tax beside 8% service tax. The checker now reads it as a flat amount, and a wrong SST row beside it is no longer hidden."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent: its own arithmetic checks, plus the official rule sets for the invoice's profile. Most of its arithmetic rests on one assumption: every tax is a percentage of a taxable amount. Malaysia's tourism tax isn't.

## A tax charged per room-night

A Malaysian hotel charges a tourism tax of 10 MYR per room-night, on top of service tax (SST). Under Peppol PINT Malaysia it goes into the invoice as its own tax subtotal, in tax scheme `AAL`, category `TTX`, with no `Percent` at all. PINT MY's rule ALIGNED-IBRP-TTX-08 actually forbids one:

```xml
<cac:TaxSubtotal>
  <cbc:TaxableAmount currencyID="MYR">750.00</cbc:TaxableAmount>
  <cbc:TaxAmount currencyID="MYR">30.00</cbc:TaxAmount>
  <cac:TaxCategory>
    <cbc:ID>TTX</cbc:ID>
    <cac:TaxScheme><cbc:ID>AAL</cbc:ID></cac:TaxScheme>
  </cac:TaxCategory>
</cac:TaxSubtotal>
```

The invoice's tax total (BT-110) is the SST plus the tourism tax: 63.20 + 30.00 = 93.20 on our example.

## What the checker did

OpenPeppol ships four tourism tax samples among its 24 PINT MY example files. Our built-in checks flagged all four:

- **INV-038**: "tax breakdown row 2 tax percentage is missing or invalid". There isn't supposed to be one.
- **INV-018**: "tax total does not match its line tax percentages". It added up only the SST, so it expected 12.00 where the file says 32.00.

An earlier fix had worked around this in the report: if a file had a breakdown row like this, both checks were switched off for the whole file. That stopped the false alarms but caused a quieter problem. On a hotel invoice, the SST row sitting right beside the tourism tax was no longer checked. Write 79.00 of service tax on 790.00 at 8% and the report said nothing.

There was a third problem we only found by writing our own example. A hotel line carries two tax categories, SST and tourism tax. Our reader took whichever came first. Put the tourism tax first and the line had no rate, so the checker raised INV-011 ("line tax percentage is invalid"). That was a blocking finding on a file that passes every official PINT MY rule.

## The fix

A breakdown row in a scheme other than VAT or GST, with no percentage, is now read as a flat amount:

- it needs a readable tax amount, and nothing more (no rate, no line group to match);
- its amount is added to the expected tax total, so a total that leaves out the tourism tax is still INV-018, and the fix line gives the right figure (93.20);
- the SST rows beside it are checked as before;
- a line's rate comes from its VAT or GST category, whichever is listed first.

The blanket switch-off in the report is gone. The Python command-line tool got the same change, so it and the web page agree.

## Measured

Built-in checks alone, on OpenPeppol's PINT MY good-case examples (`eval/phive-corpus.mjs --good --builtin`): **20 of 24 clean before, 24 of 24 after.** With the official rule sets on, the four samples were already clean thanks to the switch-off. They stay clean now that it is gone. On our made-up hotel invoice (`examples/pint-my-tourism-tax-invoice.xml`), the old code raised four built-in findings, one of them blocking even with the official rules on. The new code raises none, and PINT MY's own rules raise none either. A wrong SST row on that file is INV-038 again (`flat-tax.test.mjs`, 7 tests; `tests/test_flat_tax.py`, 6).

## What this does not show

All of these files are examples: OpenPeppol's samples and our own made-up invoice. No real hotel's invoice and no MyInvois verdict have been tried. The tourism tax amount itself, 10 MYR times the nights, isn't checked against the line's quantity, because PINT MY's rules don't fix the unit and we won't guess it. While reading the corpus we also looked at the one remaining Singapore finding. Example 07 charges 2,300 SGD of transport at 7% GST with no 7% breakdown row and no GST. That's a fault in the example, not in the check, so INV-038 stays.

This is general information about how a file is checked, not tax advice.
