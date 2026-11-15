---
title: "The schema was in a tag: checking Hungarian NAV reports against NAV's own XSD"
seo_title: "NAV Online Számla 3.0 XSD validation offline, with termékdíj checks"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "NAV Online Számla 3.0 reports now get NAV's own XSD check in the browser. It matches xmllint on 6,909 seeded faults and found that NAV's API sample fails."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) learned to read Hungary's NAV Online Számla 3.0 reports this morning: the `InvoiceData` XML every Hungarian invoicing program sends to the tax authority. That version checked NAV's published business rules and the arithmetic behind its warnings. Two gaps were left, and both are now closed.

## The XSD pass

NAV checks every report against its XML schema before anything else. A file that fails is refused with SCHEMA_VIOLATION, and the invoice counts as not reported. We could not run that check. NAV's `invoiceData.xsd` imports a shared schema, `NTCA/1.0/common`, without saying where to find it, and NAV's `Common` repository on GitHub holds version 2.0.

Version 1.0 had not gone anywhere. It sits in the same repository under the tag `common-1.0.0`. Point the import at it and xmllint validates all 30 of NAV's sample invoices.

The checker runs in the browser, and xmllint does not. So a build script reads the three schema files into a table, and a small validator walks each file against it. NAV files mix three XML namespaces (`data`, `base` and `common`), and an element written in the wrong one is a schema error even when its name is right. So the validator keeps track of each element's namespace, which our other schema checks never needed to do.

To test it, we seeded one fault at a time into NAV's 30 samples: an element deleted, doubled, swapped with its neighbour, moved to another namespace, or given an empty, overlong, negative, over-precise or impossible value. Then we asked both xmllint and our validator whether the file was valid. Over three runs that was 6,909 broken files, and the two gave the same answer on every one. That shows the validator agrees with xmllint. It does not show which mistakes real invoicing programs make.

## What it found first

NAV publishes one sample of the API request that carries reports, `manageInvoice.xml`, with three invoices inside it encoded in Base64. The schema pass flagged all three. Each one has a `privatePersonIndicator` element, the 2.0 way of saying "the buyer is a private person". Version 3.0 replaced it with `customerVatStatus`. xmllint refuses them too: "Expected is customerVatStatus". So NAV's own example request would be refused by NAV. The checker now names the 3.0 replacement when it sees the old field, since anyone who copied NAV's sample will hit exactly this.

## Product fee totals

Hungary charges a product fee (*termékdíj*) on packaging and some other goods. When an invoice carries it, the lines report the fee by product code and a summary adds it up. NAV warns when the two disagree. This morning's note said the descriptions of those warnings (Annex I of the interface specification) were not in NAV's repository. They are: the English PDF dated 2026.02.12 carries them from about page 300. We read the 13 product fee warnings and implemented them. The checks cover CSK or KT codes, the "obligated" flag against the line data, quantity times rate, and amounts and quantities by code against the summary. They use the tolerance Annex I gives: 1% of the forint value, and at least 1 forint.

NAV's one product fee sample gets no finding, and each warning has a test that breaks that sample in the matching way.

## What is still open

Everything above is measured on NAV's samples and on faults we seeded. We have not yet seen a real company's report alongside NAV's response to it, so we cannot yet say how often the checker agrees with NAV in real use. If you send NAV reports and have a rejected one you can share with the numbers blanked out, that is the comparison we want next.

A clean result means the report passes NAV's schema and the checks NAV publishes. It does not mean NAV will accept it, and it is not tax advice.

Details: the [venture README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) and `eval/nav-xsd-and-product-fee-2026-11-15.md`.
