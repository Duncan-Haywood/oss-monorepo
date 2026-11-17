---
title: "Checking a Spanish Facturae file before FACe sees it"
seo_title: "Facturae 3.2.2 validator: schema and totals checked offline"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our free checker now reads Spain's Facturae 3.2.1 and 3.2.2 offline: the official XSD plus its totals formulas, matched against xmllint on 1,000 files."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice on your own machine before you send it. Until today it had nothing to say about Spain's own format. Facturae is the XML that invoices to Spanish public bodies have had to use since 2015, sent through FACe or a regional hub. It is also one of the formats Spain's coming B2B e-invoicing rules allow. If you dropped a Facturae file in, the checker tried to read it as UBL and complained about fields that Facturae never has.

It now reads Facturae 3.2.1 and 3.2.2 with rules of its own.

## What it checks

**The schema.** The Ministerio de Hacienda publishes the XSDs on facturae.gob.es. A build script downloads both versions, checks their SHA-256 and turns them into a table: element order, how often each element may appear, the allowed values and all 22 code lists. A file that breaks the schema is refused before anything reads its content, so this comes first. One common fault, a decimal comma (`1050,00`) left by a spreadsheet set to Spanish, gets a message of its own.

**The totals.** Facturae's field description spells out how each total is built, and the checker applies each formula:

- line cost is quantity times unit price, and the line's gross amount is that cost less its discounts plus its charges;
- the invoice's gross total, its general discounts and charges, and the total before taxes;
- each *cuota* and *recargo de equivalencia* is base times rate;
- withholdings such as IRPF are subtracted: invoice total = before taxes + taxes charged − taxes withheld;
- the total to pay comes after subsidies and advances, and the total to execute after retentions, payment in kind, *suplidos* and financial expenses;
- the batch header's three sums, and its invoice count.

**Everything else that is easy to get wrong.** It checks that the `SchemaVersion` agrees with the namespace, and that an individual (`I`) file holds one invoice. A corrective invoice (`OR`) needs its `Corrective` block. Under methods 01 and 02 that block needs the corrected invoice's number and, in 3.2.2, its date. Each reason code must come with the description the schema pairs with it. A summary invoice needs its invoicing period. A foreign-currency invoice needs its exchange rate and euro amounts. Last, there is the NIF, NIE or CIF check character.

## How we tested it

We have no real business's Facturae file, so we did two other things.

First, a seeded generator wrote 1,000 random files. They covered batches, IVA and IGIC, *recargo*, IRPF, general discounts, advances, subsidies, *suplidos*, corrective invoices, foreign buyers and USD invoices. `xmllint` with the Ministry's own XSDs accepted all 1,000, and the checker flagged none of them.

Second, we broke them. We made 6,539 structural changes of 18 kinds, such as a missing element, a swapped pair, an unknown tag, a bad code, a comma, nine decimals, 30 February or a cut-off file. On every one, the checker accepted or rejected the file exactly as `xmllint` did. We also made 5,006 arithmetic changes that keep the file schema-valid, and the expected rule caught each one.

One limit is worth stating plainly. The same session wrote the generator and the checker from the same reading of the field description. The structure results are independent, because `xmllint` and the Ministry's XSD decide them. The arithmetic results are not: if we misread a formula, both sides share the mistake. A real file, or a real FACe rejection, would settle that.

## A bug it turned up

The Spanish ID check was wrong, and not only for Facturae. It sent every foreigner's NIE (X, Y or Z first) and every K, L or M NIF to the company-number algorithm, so valid numbers failed as typos. We compared it with python-stdnum on 6,000 numbers. Before the fix, the two disagreed on 891, and 750 of those were valid numbers we refused. After the fix, 55 disagreements remain. All of them are company numbers where python-stdnum accepts either form of the control character and we accept only the form the entity letter calls for. Both the browser checker and the Python CLI are fixed.

## What it does not do

It does not verify the XAdES signature. FACe needs a signed file, and signing comes after this check. It does not look up DIR3 administrative-centre codes and does not know FACe's own error codes. It skips the schema step for the old 3.2 (2009) version, and says so. As always, the result is an offline observation, not FACe's acceptance and not tax advice.

Try it: drop a `.xml` Facturae file on the [checker](https://marisstella.app/einvoice-preflight/). Nothing is uploaded. The method and numbers are in `ventures/einvoice-preflight/eval/facturae-differential-2026-11-15.md`.
