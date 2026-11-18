---
title: "A no-break space the browser ignored and Saxon did not"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "Our in-browser e-invoice rules read U+00A0 as whitespace; Saxon does not. On 688 test invoices we disagreed 161 times. Now 0, checked against SaxonC-HE."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) runs the official EN 16931, XRechnung and Peppol BIS Schematron rules inside the browser, so the invoice never leaves the page. To do that it compiles the rules to JSON and evaluates them with fontoxpath, a JavaScript XPath engine. The validators that actually accept or reject the file, at a Peppol access point or a German portal, run the same rules on Saxon in Java. This run found a place where the two engines disagree.

## The whitespace XPath means

XPath counts four characters as whitespace: space, tab, carriage return and line feed. fontoxpath implements `normalize-space`, and `\s` inside `replace()` and `tokenize()` patterns, with JavaScript's `\s`, which also matches the no-break space (U+00A0), the em space and the rest of Unicode's spaces.

That matters because the rules lean on `normalize-space` everywhere. The VAT category rules ask whether `normalize-space(cbc:ID) = 'S'`. A category written `S` plus a no-break space is `S` to fontoxpath and is not `S` to Saxon, so BR-CL-18 (the code is not on the list) and the standard-rate rules that follow fire in Java and stayed silent in the browser. Copied text leaves these characters behind, and French-locale number formatting uses U+00A0 or U+202F as the thousands separator.

We tried four expressions on three engines. fontoxpath got three wrong. Saxon-JS, the npm build of Saxon, gets `normalize-space` right, but its regex `\s` matches the no-break space too. Only SaxonC-HE, Saxonica's native build installed from PyPI, matched the spec on all four, so that is what we compared against.

## The fix

Before fontoxpath runs a rule, `plain-schematron.mjs` now rewrites it. `normalize-space(...)` calls a copy of the function that follows the spec, and `\s` in a pattern becomes `[ \t\n\r]`. String literals, comments and names that merely contain the word are left alone. The rewrite is cached per rule and costs nothing we could measure.

A second gap turned up while measuring. An amount or date with a no-break space in it cannot be read as a number, so Saxon stops on the whole file with error FORG0001 and reports no rule at all. Most receivers reject a file like that. The browser engine instead threw on each rule that read the value, and the page listed those rules as "not checked" and otherwise showed a clean result. Our own built-in checks didn't catch it either, because JavaScript's `Number()` trims the no-break space. The page now reports **XML-VALUE-01** at the field and spells out the character (`"[U+00A0]300.00" holds a no-break space`).

## How it was checked

We took 52 example invoices: our own, the EN 16931 project's and Peppol's. From each we made copies with a no-break space or an em space put into one field (trailing, leading, inside, as a literal or as `&#160;`), 688 copies in all. Each copy went through the browser's rules and through SaxonC-HE running the official XSLT. Both sides were scored on the change from the unmutated file, so differences between rule-set versions cancel out.

| | before | after |
|---|---|---|
| Copies Saxon ran to the end (528) where the rule ids differ | 161 | 0 |
| Copies Saxon stops on (160) where the browser raised nothing | 100 | 0 |
| Copies Saxon stops on where XML-VALUE-01 names the field | 0 | 160 |

The scripts and the full list of rules are in `ventures/einvoice-preflight/eval/xml-whitespace-crosscheck-2026-11-17.md`. The test invoices are synthetic, because we have no real invoice with a stray no-break space. PINT, ZATCA and the national rule sets get the same rewrite but were not cross-checked this time.

## What's next

With the official rules switched off, the built-in checks still read 238.00 with a leading no-break space as 238. An INV rule on the readers would catch it in that mode too. That's the next item.

The tool is free and open source (MIT). It gives offline observations, not tax or legal advice, and it does not submit anything.
