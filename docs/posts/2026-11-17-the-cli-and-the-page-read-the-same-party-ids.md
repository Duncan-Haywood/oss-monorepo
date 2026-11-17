---
title: "Our e-invoice CLI skipped a check the web page ran: 24 of 34 files read differently"
seo_title: "E-invoice CLI and browser checker: party id readers matched"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "The Python CLI read party ids only from JSON, so Peppol's id format rule never fired on XML. A two-reader diff found 24 of 34 files apart; now 0."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks e-invoices in two places: a web page (JavaScript) and a command-line tool (Python, no dependencies) for people who run checks in a build or a batch job. The two are meant to give the same answer.

Earlier today a run added INV-062. It applies OpenPeppol's identifier format rules (a GLN is 13 digits with a check digit, a Belgian enterprise number is 10 digits with no dots, and so on) to a party's legal registration number and its other identifiers, not only to its electronic address. Peppol applies them in all three places, so a dotted Belgian number in the legal registration field bounces at the network just as it would in the address.

The page got the check on UBL and CII files. The CLI got the check too, but its XML readers never filled in the fields it reads. In practice INV-062 fired in the CLI only on a hand-written JSON invoice. The CLI's CII reader also dropped the electronic address, so the older endpoint check (INV-041) never ran on CII files from the command line either.

## Measuring the gap instead of guessing it

A new script, `eval/py-js-party-readers.mjs`, takes every XML file in the venture that either reader parses as UBL or CII (34 public specimen files). It reads each one with both readers and compares three fields per party: legal registration, schemed identifiers and electronic address.

| | files that agree | files that differ |
|---|---|---|
| before | 10 | 24 |
| after | 34 | 0 |

The fix is a port, not new logic. `ubl.py` now keeps the `PartyLegalEntity/CompanyID` and every `PartyIdentification/ID` that names a scheme. The CII reader keeps `SpecifiedLegalOrganization/ID`, schemed `GlobalID`/`ID`, and the `URIUniversalCommunication` address. Both follow the same rules as `ubl.mjs` and `cii.mjs`.

## What it changes for a user

On the same 34 files, the CLI now raises INV-062 on four of the French FNFE sample invoices: their `0088` (GLN) identifiers are 10 and 12 digits long. The page raises exactly the same findings on exactly the same paths. These are samples written for France's reform, not for Peppol, so the finding is phrased as what OpenPeppol would reject, which is what it is. Nothing else changed: the only other identity findings, on five Saudi simplified invoices, were there before and are still there.

## Limits

Thirty-four files, all public specimens, none from a real business. The warning-level twin (INV-063) still stays silent in the CLI, because the Python checks have no warning severity yet. Payee and tax representative identifiers, which Peppol's rules also cover, are the next item.

These are offline format observations, not legal, tax or accounting advice, and not an acceptance by any network or authority.
