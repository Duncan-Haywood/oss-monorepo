---
title: "Peppol checks a Belgian KBO number in three places. The preflight checked one"
seo_title: "Peppol PEPPOL-COMMON id rules on PartyIdentification and CompanyID"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "INV-062 and INV-063 apply OpenPeppol's id rules to party identifiers and legal registration numbers, with 0 disagreements on 18,794 whole UBL and CII files."
---

Earlier today [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) started checking electronic addresses (the `EndpointID`) the way OpenPeppol's PEPPOL-COMMON rules check them: the Belgian KBO mod-97, the Norwegian mod-11, the GLN check digit and twelve more. That left a gap the rule file itself points to.

## Where Peppol reads an id

Each of those rules has the same context in Peppol BIS 3.0.22's Schematron:

```
cbc:EndpointID[@schemeID = '0208']
  | cac:PartyIdentification/cbc:ID[@schemeID = '0208']
  | cbc:CompanyID[@schemeID = '0208']
```

So a KBO number typed `0403.170.701` is rejected whether it sits in the electronic address, in the seller identifier (BT-29) or in the legal registration identifier (BT-30). The CII version of the rule file does the same with `ram:URIID`, `ram:ID` and `ram:GlobalID`. The preflight only looked at the first.

## What changed

- The UBL reader now keeps every `PartyIdentification/ID` that names a scheme (as `party_ids`), and the CII reader every `GlobalID` or schemed `ID`. The legal registration number (`legal_id`) was already read with its scheme.
- **INV-062** (blocking) applies the eight fatal rules (0088, 0192, 0184, 0096, 0198, 0208, 0007, 0151) to those ids. **INV-063** (a warning) applies the seven warning-level ones (Italian IPA, codice fiscale, partita IVA; Dutch KVK, OIN, VAT and establishment numbers).
- JSON input gets the same checks on `legal_id` and `party_ids`, which is where they matter most: a JSON invoice never meets Peppol's own rule set until it has been converted and sent.

Findings never repeat the id. The fix text names the shape: "10 digits (the KBO/BCE number with its leading 0), no dots or BE prefix".

## How it was checked

`eval/party-id-peppol-differential.mjs` writes each drawn id, and mutants of it, into one of eight places (seller or buyer, identifier or legal registration, UBL or CII) of a shipped example file. It then asks two questions of the same XML text. Does Peppol's own rule fire on that element? That answer comes from the COMMON assertions in `plain/peppol-ubl.json` or `peppol-cii.json`, run with fontoxpath on a slimdom DOM. And does our reader plus `checkInvoice` report INV-062 or INV-063 at that party's path, with the right severity?

Result: **0 disagreements on 9,431 files (seed 7) and 9,363 (seed 11).** Peppol's rule failed on 6,785 of the seed-7 files. Before this change, no check read the format of those elements.

## One thing Peppol's CII file does differently

Running it on whole files turned up a difference between Peppol's two rule files. In UBL, R050 (the Australian ABN) is `matches(., '^[0-9]{11}$') and u:abn(.)`. In CII it is `u:abn(.)` alone. `u:abn` reads only the first eleven characters, so in a CII file a twelve-digit "ABN", or one with junk after it, passes. An ABN is eleven digits, so INV-062 keeps the length test in both syntaxes. The eval counts these cases separately (29 at seed 7) rather than as agreement. Other deliberate differences carry over from the endpoint checks: a GLN must be 13 digits, an 11-digit Italian number must carry its check digit, and a 0211 partita IVA without IT must be 11 digits.

## What it is not

A valid checksum is not a registered company or a Peppol participant. Payee and tax-representative parties are not read yet, though Peppol's contexts match them too. The Python CLI checks `legal_id` and `party_ids` in JSON but its XML readers do not fill them yet. No access point has judged any of these files.

[Try the preflight](https://marisstella.app/einvoice-preflight/) or read the [error-code reference](https://marisstella.app/einvoice-preflight/what-does-this-e-invoice-error-code-mean.html).
