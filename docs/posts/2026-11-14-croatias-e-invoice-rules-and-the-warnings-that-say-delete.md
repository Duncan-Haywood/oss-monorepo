---
title: "Croatia's e-invoice rules, and the EU warnings that tell you to delete what Croatia requires"
seo_title: "HR-CIUS 2025 e-invoice check: OIB, KPD and the UBL-CR warnings"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Croatia's B2B e-invoice mandate began in January 2026. Our checker now runs the tax office's HR-CIUS rules and says to keep fields the EU base warns about."
---

Since 1 January 2026 a Croatian VAT-registered business sends its domestic B2B invoices as structured EN 16931 files under Fiskalizacija 2.0. Until today [E-invoice preflight](https://marisstella.app/einvoice-preflight/) checked a Croatian file against the EU rules only, and its Croatia page said so. Now a UBL invoice that names HR-CIUS 2025 also gets the Tax Administration's own rules, in the browser, with nothing uploaded.

## Where the rules come from

The Porezna uprava publishes its validation rules as Schematron. Philip Helger's phive-rules project ships them, compiled to XSLT, in an artefact called `phive-rules-eracun` on Maven Central. The current one is the Tax Administration's schematron of 13 March 2026. Our existing XSLT reader turned it into the JSON our in-browser engine runs: 73 checks under 62 rule ids, none lost. That includes the OIB check-digit function (ISO 7064 MOD 11,10) and a list of 3,359 KPD product codes.

What a Croatian file is now checked for, among other things:

- **OIB check digits** for the seller, the buyer and the *operator*, the person who issued the invoice, whose name and OIB go in `SellerContact`;
- a **KPD classification code** (`listID="CG"`) on every line, and the code must be on the list;
- an **issue time** in `hh:mm:ss`, and a **process code** from P1 to P12 (or `P99:` plus your own label);
- HR VAT category labels such as `HR:PDV25` or `HR:E`;
- **no empty XML elements**, anywhere except the signature.

The rule texts are in Croatian. Every one of the 62 now has an English fix.

## The EU base says delete it; Croatia says keep it

The surprising part came from the first clean test file. With no Croatian rule failing, the EU base still raised three warnings:

- `UBL-CR-006`: *A UBL invoice should not include the IssueTime*
- `UBL-CR-200`: *... should not include the AccountingSupplierParty SellerContact*
- `UBL-CR-597`: *... should not include the InvoiceLine Item ClassifiedTaxCategory Name*

These are EN 16931's "outside the core model" warnings. Croatia requires all three: the issue time (HR-BR-2), the operator (HR-BR-37, HR-BR-9), and the HR category label (HR-BR-16). An exempt line adds a fourth, `UBL-CR-601` on the exemption reason, which HR-BR-36 requires. Someone tidying up warnings would delete exactly the fields that get the file rejected. So on an HR-CIUS file those warnings now read "Keep it: this invoice names HR-CIUS 2025, and Croatia's rules require ...". They remain warnings and do not fail the file.

## Checked against the authority's own stylesheet

A rule set converted from XSLT to another engine can drift without anyone noticing, so we ran both side by side. Saxon-JS ran the Tax Administration's original stylesheet, and our engine ran the converted rules. They checked our sample and 400 randomly damaged copies of it, then did the same again for a version with an exempt line. Where Saxon finished, the two agreed on the Croatian rule ids for 362 of 372 files and 360 of 367. Every disagreement was a file whose specification identifier had been deleted or overwritten. Our checker then has no reason to treat the file as Croatian, while the stylesheet assumes it is.

Saxon stopped with an error on 29 and 34 files. Some rules convert a field to a date or a number without checking it first, so a blank or garbled value aborts the whole report. Our engine evaluates each rule on its own: it reports the others and lists the one it could not evaluate.

## What it does not do yet

No real Croatian business's invoice has been through it, and no access point or Tax Administration verdict has been compared. Those are the next things to find. The creator cannot yet write the HR extension block that an invoice with exempt lines needs. CII Croatian files get the EU rules only. The full record is in the venture's README and `eval/hr-cius-differential-2026-11-14.md`.

*Offline observations, not legal or tax advice, and not an acceptance by any authority.*
