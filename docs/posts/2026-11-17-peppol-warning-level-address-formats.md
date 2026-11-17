---
title: "Peppol only warns about a bad Italian or Dutch address. The preflight now does too"
seo_title: "Peppol warning-level endpoint rules: IPA, partita IVA, KVK, OIN"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "Seven warning-level PEPPOL-COMMON rules now run as a non-blocking INV-061 warning, with 0 disagreements against Peppol's own XQuery on 23,999 drawn ids."
---

Earlier today [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) started checking Belgian, Nordic, Danish and Australian electronic addresses the way OpenPeppol's fatal PEPPOL-COMMON rules check them. Peppol's rule file has a second group of address rules that it only *warns* about: seven of them, for Italian and Dutch identifiers. They were still missing. This run adds them.

## What the rules say

All seven are in Peppol BIS 3.0.22's Schematron, and each carries `flag="warning"`:

| Scheme | What it is | Peppol's test |
|---|---|---|
| 0201 | Italian IPA office code | 6 letters or digits (R044) |
| 0210 | Italian codice fiscale | 16 characters in the personal pattern, or an 11-digit number (R045) |
| 0211 | Italian partita IVA | after an IT prefix, 11 digits with a check digit (R047) |
| 0106 | Dutch KVK number | 8 digits (R054) |
| 0190 | Dutch OIN | 20 digits (R055) |
| 9944 | Dutch VAT number | NL, 9 digits, B, 2 digits (R056-1) |
| 0217 | Dutch KVK establishment number | 12 digits (R057) |

Before this change the preflight accepted any non-empty text for six of these. 0190 got a digit count after stripping spaces, so `0000 0001 2345 6789 0000` passed too. A five-character IPA code or a mistyped partita IVA produced nothing.

## Why a warning and not an error

When Peppol's own validator finds only warnings, the file passes, and an access point delivers it. If the preflight blocked a file for a rule Peppol only warns about, a file the network would accept would show as failed. So INV-061 is a warning. It is listed, it names the Peppol rule, and the file's status stays "pass". Like every address finding, it never repeats the identifier.

This matters most where Peppol's rule set does not run at all: invoices sent to the checker as JSON, and Italian or Dutch files that claim plain EN 16931 or NLCIUS instead of the Peppol profile.

## How it was checked

The test uses Peppol's own code. A script reads the seven assertions out of the bundled rule file and runs them with fontoxpath, the XQuery engine the checker already ships. Then it draws ids. Partita IVA check digits are found by brute force against Peppol's `u:checkPIVAseIT`, so the generator shares no code with what it is testing. Each valid id also gets up to twelve mutants: a changed digit, a digit typed as a letter, a swapped pair, a dropped or added character, a dot, space, hyphen or accented letter inside, a prefix in front, lower case.

The result: 23,999 ids on one seed and 24,029 on another, with **0 disagreements** on both. On the first seed, Peppol warned on 15,275 of those ids, and the preflight had said nothing about any of them before this change. The tables are in [`eval/endpoint-peppol-warnings-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/endpoint-peppol-warnings-2026-11-17.md).

## Where we are stricter, and why

Peppol's Italian rules have two gaps, and the preflight goes past both on purpose. The eval counts these cases separately and leaves them out of the disagreement total:

- An 11-digit codice fiscale or partita IVA has to carry its check digit. Peppol's `u:checkCF` accepts any 11-digit integer. `u:checkPIVAseIT` reads the check digit only when the value starts with IT. Every partita IVA, and every company codice fiscale, is issued with that digit, so a wrong one is a typo.
- A 0211 value without the IT prefix still has to be 11 digits. Peppol's function returns true for any text that does not start with IT.

## What it does not do

A well-formed IPA code or KVK number may still not exist. This checks format, not the registry. The rules only read the endpoint, though Peppol applies the same tests to party identifiers and legal registration numbers. That is the next item. The Python command line has no warning severity, so it stays silent on INV-061, as it already does for the BIC notes.

*E-invoice Preflight is an open-source format checker, not legal or tax advice. A file that passes it can still be rejected by a platform or a buyer.*
