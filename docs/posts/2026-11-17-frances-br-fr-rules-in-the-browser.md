---
title: "France's BR-FR e-invoice rules now run in the browser, checked against FNFE's own XSLT"
seo_title: "Check a French e-invoice against the BR-FR rules, free"
date: 2026-11-17
tags: [einvoice-preflight, ventures, france]
description: "E-Invoice Preflight now runs FNFE-MPE's BR-FR Schematron 1.4.0.04 locally. It matched Saxon on 264 of 264 runs, after three fixes to how it reads Schematron."
---

France's e-invoicing reform went live on 1 September 2026. Every business must now be able to receive structured invoices, and large and mid-size firms must send them. The approved platforms (PA) that carry those invoices check each one against a set of French business rules, the "BR-FR" rules in AFNOR's XP Z12-012 standard. FNFE-MPE, the French e-invoicing forum, publishes them as Schematron on GitHub ([fnfempe/France_RFE](https://github.com/fnfempe/France_RFE), Apache-2.0). Before 1 October 2026 a platform could treat a failure as a warning. Since then a failure gets the invoice rejected.

[E-Invoice Preflight](https://marisstella.app/einvoice-preflight/) now runs those rules. Tick "Also apply the French rules" and "official Schematron", drop a UBL, CII or Factur-X file, and the 175 UBL or 171 CII checks run in your browser. The file is never uploaded. A file that names the Extended-CTC-FR profile gets the checks without the tick.

## What the rules catch

The checks a sender is most likely to fail:

- an invoice number with a space, a dot or more than 35 characters (BR-FR-01, -02);
- a business process code (BT-23) that is not one of France's billing modes (B1, S1, M1 and the rest). A Peppol process id fails here;
- an impossible date, or a document type France does not accept;
- a VAT rate France does not have (21% fails; 20, 10, 5.5 and 2.1 pass, plus the overseas rates);
- a SIREN or SIRET under the wrong identifier scheme, or a SIRET whose first nine digits are not the SIREN;
- multi-vendor invoices (marketplaces, single invoices with several sellers) whose GROUP line does not add up to its sub-lines.

FNFE's messages are in French, and the tool shows them as published.

## How we know it reads the rules the way a platform does

Platforms run the rules through an XSLT engine, usually Saxon. Our tool turns the same Schematron into plain XPath and runs it with fontoxpath, so nothing has to leave the page. A translation like that can be wrong without any sign of it: a rule that never fires looks just like a file that passes. So we compared the two engines directly. Saxon-JS ran FNFE's own compiled XSLT and our route ran its own compile, on FNFE's 26 example invoices (UBL and CII, EN 16931 and Extended-CTC-FR). Each file was run as published and again broken ten different ways: a bad invoice number, a Peppol BT-23, 30 February, type code 999, the notes removed, a 21% rate, the SIREN scheme swapped, a line net off by 10, line status codes removed.

The result: **264 of 264 runs reported the same rule ids on both engines.** No rule was left unevaluated, and the 26 published files pass every rule. The script and the numbers are in the repository (`eval/br-fr-crosscheck.mjs`, `eval/br-fr-crosscheck-2026-11-17.md`).

## The first compile was wrong in three ways

The first compile was not usable. Three things in FNFE's Schematron broke our translator, and each one would have hidden real errors:

1. **A prefixed variable in a helper function.** FNFE writes `<xsl:variable name="custom:eas-codes">` inside its functions. fontoxpath cannot bind a prefixed `let`, and that single error broke every function at once. Most BR-FR checks were skipped as a result.
2. **A variable shared across patterns.** BR-FR-MV-01 declares `$invoiceID` and twelve later patterns read it. In the standard Schematron-to-XSLT compiler, a pattern's variable becomes a global one. Ours had treated it as local, so those twelve patterns could not run.
3. **A rule variable read inside a predicate.** BR-FR-MV-05 defines `$invcurrency` as `../../cbc:DocumentCurrencyCode` and reads it inside `TaxAmount[...]`. Our compiler pasted the text in where it was used, so `../..` started from a different element and found nothing. As a result, FNFE's own valid multi-vendor examples failed. The fix binds the variable once, at the rule's node, with XPath's `let ... return`, which is what XSLT does.

All three fixes are in the shared compiler, so we rebuilt every other rule set with it. The EU base, XRechnung, Peppol, the Dutch, Croatian and Romanian sets came out byte-for-byte the same. One set changed: Saudi Arabia's BR-KSA-F-13 had the same predicate bug. It checked a seller's ids against the buyer's list of allowed schemes, and it is now correct.

## What it does not do

It does not cover FNFE's separate rule sets for the Extended-CTC-FR and Factur-X EXTENDED profiles, the life-cycle status messages (CDAR) or the e-reporting flows (Flux 10). We have not yet compared it with a real platform's rejection. It is a preflight check, not a certified platform, and not legal advice. If you have a rejection from a PA along with the file that caused it, it would tell us where this check still differs.
