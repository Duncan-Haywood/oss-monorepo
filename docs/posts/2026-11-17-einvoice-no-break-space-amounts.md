---
title: "An invisible space after an invoice total, and why our checker missed it"
seo_title: "An invisible space after an e-invoice total our checker missed"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "A no-break space after an e-invoice amount passed all our built-in checks while Saxon validators reject the file. INV-065 now names the field."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks UBL and CII invoices before they go to a Peppol access point or a government portal. Earlier today we fixed its in-browser official rules so they read whitespace as Saxon does. That left one gap, and this post is about closing it.

## The gap

Copy a total out of a spreadsheet set to a French locale, or out of a PDF, and you can end up with `238.00` followed by a no-break space (U+00A0). You can't see it in most editors.

Our XML readers trimmed every value before reading it. JavaScript's `trim()` and Python's `strip()` both treat the no-break space as whitespace, so the reader saw `238.00` and every built-in check passed. XML counts only four characters as whitespace: space, tab, carriage return and line feed. A validator built on Saxon, which is what Peppol access points and the German KoSIT validator run, can't read `238.00` plus U+00A0 as a decimal. It stops on the whole file and reports no rule. The sender gets a rejection that names nothing.

The same space written as the character reference `&#160;` failed the other way. Our UBL reader didn't decode references inside amounts, so it rejected the whole file as "not a number" and didn't say which field.

## The fix

Both readers now go through the file's leaf values. Any value that becomes a number, date or true/false only once JavaScript's trim has removed something gets reported as **INV-065**, at the field, with the character written out:

> PayableAmount "238.00[U+00A0]" holds a no-break space (U+00A0), so it is not a valid number or date in XML (/Invoice[1]/LegalMonetaryTotal[1]/PayableAmount[1]).

The official-rules route uses the same test for its XML-VALUE-01, so the two now agree on what counts. The command-line tool reports INV-065 too.

## How we checked it

We took 62 invoices: our own examples and the EN 16931 project's UBL and CII examples. Every number, date and boolean in them (2,784 values) got one of five invisible characters: a trailing no-break space, a leading narrow no-break space, a trailing byte-order mark, a trailing ideographic space, or a trailing `&#160;`. That gave 13,920 altered files.

- Before the fix, all 11,136 files with a literal space passed the built-in checks clean.
- After it, INV-065 names the altered field in all 13,920.
- SaxonC-HE 13.1, run separately, could read all 2,784 original values and none of the 13,920 altered ones.
- As a control, we put the same space after 2,701 names, ids and codes. INV-065 fired on none of them.

The files are synthetic. We have no real invoice with a stray no-break space yet, and one would be the best next test. The scripts and the full table are in the repository: `eval/nbsp-amounts-2026-11-17.md`.
