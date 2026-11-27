---
title: "Peppol BIS 3.1.0 rejects files from 24 February: check yours against it now"
date: 2026-11-18
tags: [einvoice-preflight, ventures]
description: "Our free e-invoice checker now runs Peppol BIS 3.1.0 before it is in force and marks each new finding. Five of OpenPeppol's own 3.0.22 examples fail it."
---

> **Update, 2026-11-27:** the offer to run the checker as your own self-hosted API was withdrawn. The checker on the site and its command line still work.

OpenPeppol publishes **Peppol BIS Billing 3.1.0** on 23 November 2026. Access points must apply it from **24 February 2027**. From that day, a Peppol invoice that passes today's rules (release 3.0.22) can be rejected. [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) can now tell you which of your files that applies to, three months early.

## How to use it

On the page, tick "check against Peppol BIS 3.1.0" and drop in your invoice. The rules run in your browser and the file never leaves your machine. On a self-hosted copy, call `POST /v1/validate?schematron=1&peppol=next`. The checker runs 3.1.0 in place of 3.0.22 and also runs 3.0.22 behind the scenes. Any finding 3.0.22 does not raise is marked as new. If the new finding is fatal, it says "rejected from 2027-02-24".

The rules come from OpenPeppol's release branch (`2026-Q4-QA2`, commit `90f078a`), compiled to the JSON form the page already runs. OpenPeppol ships unit tests with its rules. The compiled set agrees with all 1,138 of that branch's assertions.

## What a sender will run into

From the release notes and the rules themselves:

- **Scheme 0088 takes a 13-digit GLN only** (PEPPOL-COMMON-R040). Other values under 0088 used to get through.
- **Belgian enterprise numbers (0208) must start with 0 or 1** (R043). They already had to pass mod 97.
- **The Dutch identifier checks become errors.** R054 to R057 cover KVK, OIN and the Dutch VAT and establishment numbers. They have been warnings since May.
- **New warnings:** Luxembourg VAT numbers (R058, check digits mod 89), the Luxembourg Matricule (R059), Belgian VAT numbers (R062) and seven Slovak rules. OpenPeppol says these become errors in May 2027.
- **120 mandatory-element rules** (R141 to R276). Each says that an element the specification marks 1..1 is present exactly once.

## The first thing it found: OpenPeppol's own examples

We ran every example file in OpenPeppol's 3.0.22 release through both rule sets. Five of the 17 pass 3.0.22 and fail 3.1.0, and all five fail on R040. They put values such as `9482348239847239874`, 19 digits, under scheme 0088. The 3.1.0 release note says the examples were fixed for exactly this reason, and the fixed copies pass. If the reference files carried such values, real sending software probably does too. `eval/peppol-next-diff.mjs` in the repository prints the same comparison for any folder of your own files.

## The second thing: a zero that went missing

One unit test out of 1,138 failed at first. LU00000101 is a valid Luxembourg VAT number: 000001 mod 89 is 1, and the check digits are "01". The new rule drew a warning on it anyway. The cause was in fontoxpath, the XPath engine the page uses. Its `format-integer(1, '00')` returns "1", not "01".

The same call sat inside our compiler's stand-in for `format-number`, which fontoxpath lacks. So 15.05 came out as "15.5". Only the Saudi ZATCA rules use `format-number`. In ZATCA's copies of BR-CO-17 and BR-S-09, which check that subtotal VAT equals taxable amount times rate, the bug moved the expected value by up to 0.45. Take 15% of 100.35: the right answer is 15.05, the checker read it as 15.5, and a stated VAT of 15.40 passed. The compiler now pads the zeros itself, the ZATCA rules are rebuilt, and a test that failed on the old rules now passes.

## The third thing: pasted XML never got the official rules

Trying the new box in a real browser turned up an older fault. The page named any pasted text `pasted.json`, and the step that runs the official rules skips JSON files. So a UBL or CII invoice pasted into the box was checked by the built-in rules only, never by the EN 16931, XRechnung or Peppol Schematron. A dropped file was fine. Pasted text that starts with `<` is now treated as XML.

## Limits

The branch is OpenPeppol's release candidate. Once 3.1.0 is tagged we will rebuild from the tag and compare the two. This is a preflight check, not an access point's verdict, and we have not yet run a real business's invoices through the comparison. Details and numbers are in `ventures/einvoice-preflight/eval/peppol-bis-3.1.0-2026-11-18.md`.
