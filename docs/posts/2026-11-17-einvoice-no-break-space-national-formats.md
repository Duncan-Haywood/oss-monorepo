---
title: "An invisible space in an Italian, Polish or Hungarian e-invoice amount, now caught"
seo_title: "Invisible space in FatturaPA, KSeF and NAV amounts, now caught"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "A no-break space after an amount passed our FatturaPA, KSeF, Facturae, NAV and ISDOC checks while XML schema validators refuse it. Now every reader names it."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice in the browser before it goes to a tax authority or a Peppol access point. Earlier today it learned to spot a number or date with a no-break space (U+00A0) stuck to it in UBL and CII files. This run did the same for the national formats it reads: Italy's FatturaPA, Poland's KSeF FA(3), Spain's Facturae, Hungary's NAV Online Számla reports and the Czech ISDOC.

## Why one invisible character matters

XML counts four characters as whitespace: space, tab, carriage return and line feed. JavaScript's `trim()` removes many more, including the no-break space a French or Italian spreadsheet uses as a thousands separator and the byte-order mark that turns up when files are glued together. So our readers saw `1320.00` followed by a no-break space, read 1320, and the file passed.

A validator built on XML Schema doesn't trim that character, so the value isn't a decimal and the file fails. SdI, KSeF, FACe and NAV all validate against XML schemas. You'd find out from a rejection, and the rejection points at a value that looks fine in every editor.

## What we measured

We took 36 real and sample files: 15 FatturaPA samples from the Agenzia delle Entrate and the eigor project (via the ZUGFeRD corpus), NAV's 10 published InvoiceData samples, the ISDOC association's demo invoices, and our own FA(3), FatturaPA and Facturae examples. We put five kinds of invisible space on each of their 2,001 numbers, dates and yes/no values, one at a time, which made 10,005 copies.

- Before the change, **6,880 of the 8,004 copies with a literal space got no new finding at all**. Most of the rest got a generic "doesn't match the pattern" message that didn't say why.
- After the change, rule INV-065 names the exact element on **all 10,005 copies** and writes the space out, for example `1320.00[U+00A0]`.
- Saxon (SaxonC-HE 13.1) refuses every mutated value and accepts every original, so the rule agrees with a real XML processor on every row.
- 1,333 text fields (names, codes) given the same space draw no INV-065: there, the space is just text.

The copies are synthetic. We didn't have a real file with this fault, and we couldn't run the tax authorities' own validators from here. The full method and the commands to repeat it are in [`eval/nbsp-other-formats-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/nbsp-other-formats-2026-11-17.md).

## If you see INV-065

Delete the character so the value holds only digits (and a sign or decimal point), or only the date. You usually can't see it in an editor, so search for it by its code (U+00A0). If your export comes from a spreadsheet, format the column as plain numbers before you export.

*E-invoice Preflight is free and open source (MIT). It is not tax or legal advice; your tax authority's validator has the final word.*
