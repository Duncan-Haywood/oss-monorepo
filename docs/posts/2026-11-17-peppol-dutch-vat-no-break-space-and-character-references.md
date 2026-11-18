---
title: "One invisible character, two XPath engines: Dutch VAT numbers and Peppol's R056-2"
seo_title: "Dutch VAT numbers, no-break spaces and Peppol R056-2"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "A valid Dutch VAT number written with &#66; drew a false blocking error; a trailing no-break space slipped past. 3,149 disagreements with Peppol to 0."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it goes to a Peppol access point. Earlier today it learned OpenPeppol's rule PEPPOL-COMMON-R056-2, a warning that a Dutch VAT number must read exactly `NL`, nine digits, `B`, two digits. This run closed the three gaps that change left open, and found that the tool we used to check ourselves had the same blind spot as the code it was checking.

## Three gaps

**Character references.** XML lets you write any character as a reference: `&#66;` is `B`. Our in-browser XML reader keeps text exactly as written, so `NL123456782&#66;01`, a perfectly valid number, reached the VAT check as `NL1234567826601` and drew a *blocking* error. Peppol, like any XML processor, reads `NL123456782B01` and passes it. A false blocking error is the worst kind of finding for a preflight: it tells someone to fix a file that is fine.

**A trailing no-break space.** Copy a VAT number out of a web page or a spreadsheet and you can pick up U+00A0, the no-break space. JavaScript's `trim()` removes it. XPath's `normalize-space`, which Peppol's rule applies, removes only the four XML whitespace characters (space, tab, carriage return, line feed), so the number fails the pattern and Peppol warns. We said nothing.

**Places EN 16931 does not name.** R056-2's context is every `PartyTaxScheme` whose scheme is `VAT`, wherever it sits. That includes the payee's, the deliver-to party's (in the header or on a line) and a second VAT scheme on the seller. EN 16931 defines no VAT number for those parties, so our readers never looked. Peppol does.

## The checker of the checker

We measure each rule against Peppol's own assertion, not our reading of it. A script draws valid Dutch VAT numbers (elfproef or mod 97-10), makes 26 kinds of typo and encoding mutant, writes each into one of 13 places in a real UBL or CII invoice, and asks of the same XML: does Peppol's rule fire, and do we report it?

The first run with the new mutants reported 900 cases where *we* warned and Peppol did not, every one a trailing no-break space. The oracle evaluates Peppol's XPath with fontoxpath, a JavaScript engine, and fontoxpath's `normalize-space` strips U+00A0. The XPath specification says it should not. Saxon, the engine Peppol's validators run, agreed with the specification:

```
<a>NL123456782B01&#160;</a>
Saxon:      matches(normalize-space(.), '^NL[0-9]{9}B[0-9]{2}$') = false  (warns)
fontoxpath: normalize-space strips the U+00A0                       (passes)
```

So the oracle now uses a specification copy of `normalize-space`, and every generated file was re-checked with Saxon-HE 12.5 running the rule as XQuery.

| run | files | Peppol warns | disagreements |
|---|---|---|---|
| before, seed 7 | 7,423 | 4,848 | 3,149 (2,707 missed, 442 false blocking errors) |
| after, seed 7 | 7,423 | 4,848 | 0 |
| after, seed 11 | 7,438 | 4,858 | 0 |

Saxon and the corrected oracle differ on 0 of 15,539 files.

## What it means if you send Dutch invoices

A Dutch VAT number written with an XML reference no longer draws a false error. One with a trailing no-break space, or written with spaces or dots on a payee or delivery party, now gets the same warning Peppol would give, pointing at the party. The warning does not block anything; it tells you what the access point will say.

## What is next

The same fontoxpath behaviour sits under the tool's plain-JavaScript Schematron route, which runs the full EN 16931 and Peppol rule sets in the browser without Saxon. Any rule that uses `normalize-space` can disagree with Saxon on a no-break space. That is the next fix, checked the same way. The full measurement is in [`eval/nl-vat-r056-2-payee-refs-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/nl-vat-r056-2-payee-refs-2026-11-17.md).

*E-invoice Preflight is a free, open-source (MIT) checker. Its findings are not legal or tax advice; your access point and tax authority have the final word.*
