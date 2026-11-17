---
title: "France's e-invoice rules against Saxon, and a hidden space in Flux 10"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "France's BR-FR, extended, CDAR and Flux 10 rules, in the browser and on Saxon over 1,784 test copies: no rule ids differed. One Flux 10 gap is fixed."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice against the official rules before you send it, in your browser, so the file never leaves your machine. The rules are published as XSLT for Saxon, the engine most big validators run. We turn that XSLT into XPath for a browser engine, and then check that the result agrees with Saxon.

Today's earlier runs did that for the EU base rules, PINT, ZATCA and four national sets. This run did France: the sets that matter for the September 2026 reform.

- **BR-FR**, the French rules on top of EN 16931, in UBL and CII (FNFE-MPE, XP Z12-012, version 1.4.0.04).
- **EXTENDED-CTC-FR** and **Factur-X EXTENDED**, the bases for extended invoices.
- **BR-FR-CDV**, the rules for CDAR life-cycle status messages ("received", "rejected", "paid").
- **Flux 10**, the e-reporting file for international B2B invoices, B2C sales and payments (PPF Annexe 7 v1.8 controls).

The previous report said these needed an extra compile step first. They did not: FNFE-MPE publishes every set already compiled, next to the source.

## How we tested

We used FNFE's 100 example files, plus our three made-up Flux 10 files (FNFE publishes no Flux 10 example). In each file we picked a few fields and made five copies of each, putting a no-break space or an em space before, inside or after the value: 1,784 copies in all. Saxon ran FNFE's own stylesheets on every copy, and we compared the rule ids each side raised.

## What we found

**No rule id differed on any copy Saxon finished checking, in any French set.** Without this morning's whitespace fix, the browser engine would have disagreed on 156 copies, mostly France's decimal-format rules (BR-FR-DEC): a no-break space after an amount made Saxon reject the format, while the browser engine trimmed it away.

On 43 invoice copies Saxon stopped on the whole file, and on all 43 our report names the field.

**The gap was in Flux 10.** A no-break space after an amount, say `85.50` followed by U+00A0, stops Saxon on the whole e-reporting file. Our report did flag the file, but only with G1.14, "doit comporter au maximum 2 décimales avec un séparateur point". It didn't say which field, and it didn't say the cause was a space you can't see. Spreadsheets and text copied from a PDF add these spaces all the time.

Now the Flux 10 and CDAR readers raise INV-065, as the UBL, CII, Italian, Polish, Spanish, Hungarian and Czech readers already did:

> TaxableAmount "85.50[U+00A0]" holds a no-break space (U+00A0) ... (/Report[1]/TransactionsReport[1]/Transactions[3]/TaxSubtotal[2]/TaxableAmount[1])

It names the element on all 12 Flux 10 copies Saxon stops on, and raises nothing on the 62 unmodified Flux 10 and CDAR files.

## Two things we got wrong first

Our first version raised INV-065 on any value that looked like a number, and that included SIRENs and CDAR's 14-digit date-times. In the schemas those are strings, and no French rule reads them as numbers. On 288 CDAR copies Saxon passed quietly while we would have said "not a valid number". Those elements are now left out. For the 52 copies left where Saxon ran on without a new rule (a true/false flag, a percent, a count), the message says France's rules *may* stop on the file or reject the value. It doesn't claim more than we measured.

The test script also had a blind spot. It read Saxon's rule ids only from an `id` attribute, and Flux 10's stylesheet writes none: the id is the `[G1.24]` at the start of the message. So on the first pass Saxon seemed to raise nothing on Flux 10, and the comparison proved nothing. The script now reads the id the same way the product does.

## Limits

The changed copies are synthetic. We had no real French invoice, status message or e-reporting file with a stray space, and we saw no platform rejection. The three Flux 10 files are our own. Details, commands and every count: [`eval/french-whitespace-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/french-whitespace-2026-11-17.md).

E-invoice Preflight is free and open source (MIT). It checks files against published rules. It is not tax or legal advice, and it doesn't replace your platform's own validation.
