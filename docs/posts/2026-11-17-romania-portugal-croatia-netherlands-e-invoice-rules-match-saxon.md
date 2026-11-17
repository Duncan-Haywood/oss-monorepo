---
title: "Romania, Portugal, Croatia and the Netherlands: our e-invoice rules against Saxon"
date: 2026-11-17
seo_title: "CIUS-RO, CIUS-PT, HR and NLCIUS rules checked against Saxon"
tags: [einvoice-preflight, ventures]
description: "Four national e-invoice rule sets, run in the browser and on Saxon over 5,556 test copies: no rule ids differed. The one mismatch was in our test script."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice against the official rules before you send it. It runs those rules in your browser, so the invoice never leaves your machine. The rules are published as XSLT for Saxon, the engine most big validators use. We compile that XSLT into XPath that runs in a browser engine, and then we check that the result agrees with Saxon.

Earlier today we ran that check on the EU base rules and on PINT and ZATCA. This run covered four national rule sets that sit on top of the EU base:

- **CIUS-RO**: Romania's e-Factura rules (ANAF), version 1.0.9.
- **CIUS-PT**: Portugal's rules (AMA / FEAP), version 2.1.1.
- **CIUS-HR**: Croatia's 2025 rules and HR extension (Porezna uprava), from the 13 March 2026 Schematron.
- **NLCIUS**: the Dutch rules (SI-UBL 2.0.3.13), in UBL and CII.

Only our in-browser route runs these four sets, so whatever it says is what you see.

## How we tested

We used the publishers' own example invoices: 425 files as the phive project ships them, plus Croatia's 20 published example e-invoices. In each file we picked three fields and made five copies of each, putting a no-break space or an em space before, inside or after the value. That gave 5,556 copies. Saxon ran the official stylesheet on every copy, and we compared the rule ids each side raised.

## What we found

**No rule id differed on any copy Saxon finished checking, in any of the four sets.**

Without this morning's whitespace fix, the browser engine would have disagreed with Saxon on 203 copies. One example is BR-NL-12, the Dutch payment-means rule: a no-break space after the code made Saxon reject it, while the browser engine trimmed the space and let it through. That fix was already shipped, and this run confirms it holds for these sets too.

Saxon sometimes stops on a whole file when a value can't be read as a number or date. That happened on 96 of the Romanian, Portuguese and Croatian copies, and on all 96 our report names the field with XML-VALUE-01. The Dutch stylesheet stopped on 1,064 copies, all inside the EU base rules it bundles. We check those base rules on a separate route, which an earlier cross-check already covered.

## The mismatch that wasn't

The first pass did show 46 Romanian differences. Saxon reported `BR-DEC-RO-14`, and our side reported `BR-RO-Z2`.

Romania gives each of its 22 "at most two decimals" rules its own id. Every one of them begins its message with `[BR-RO-Z2]`. Our test script took the id from the message when both were present. The product does the reverse: it reports the rule's own id, as Saxon does. So the product always matched Saxon here, and only the script was wrong. We fixed the script. The same quirk explains the "4 left over" in this morning's PINT Singapore result, which we've corrected.

## What changed

No rules and no product code changed. The test scripts did: they can now take national add-on sets and pass single files, they compare only the rules each set actually carries, and they read a rule's id the way the product does. The method and every count are in [`eval/cius-whitespace-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/cius-whitespace-2026-11-17.md).

The French sets are still to do. They are published as Schematron, not XSLT, so they need compiling first.

All the test copies are synthetic. We had no real invoice with a stray no-break space to try.

*This is a validation aid, not tax or legal advice. The receiving access point and the tax authority's own validator decide.*
