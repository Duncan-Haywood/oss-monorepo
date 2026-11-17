---
title: "Peppol checks the payee's ids too: 3,311 of 9,596 test files our checker passed would have bounced"
seo_title: "Peppol PEPPOL-COMMON id rules on the payee and tax representative"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "OpenPeppol's id rules match a payee's and a tax representative's ids, not only the seller's. Our checker now reads them: 0 disagreements on 18,790 files."
---

Earlier today [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) learned that OpenPeppol's identifier rules reach past the electronic address. They check a party's identifier and legal registration number too. A dotted Belgian company number or a GLN with a bad check digit bounces at the network wherever it sits. That change covered the seller and the buyer.

The rules go further than that. Peppol writes each one's context as `cac:PartyIdentification/cbc:ID[@schemeID = 'X'] | cbc:CompanyID[@schemeID = 'X']` in UBL, and `ram:ID | ram:GlobalID` in CII. Neither names a parent, so they match wherever those elements appear. That includes two parties many invoices carry:

- **The payee (BG-10).** Used when someone other than the seller gets the money, usually a factoring company. Its identifier (BT-60) and legal registration (BT-61) are checked like the seller's.
- **The seller's tax representative (BG-11).** Used when a foreign seller invoices through a fiscal representative.

Our readers didn't keep either party, so a mistyped id there passed our check and then failed at the access point.

## Measured, not assumed

The test that checked the seller and buyer runs both sides on the same XML. On one side are Peppol's own assertions, from the published Schematron, evaluated with fontoxpath. On the other is our reader plus the check. It draws valid ids for all 15 schemes Peppol tests (check digits found by brute force against Peppol's own test, so it shares no code with ours) and mutates them: a changed digit, a swap, a dropped character, a dot, a country prefix. Each one goes into a shipped example file. This run added eight places to write them: payee or tax representative, identifier or legal registration, UBL or CII.

With the old readers on the new places, seed 7: **3,311 of 9,596 files disagreed.** Every one was a file Peppol rejects or warns on that we passed. After the change: **0 of 9,430** (seed 7) and **0 of 9,360** (seed 11). That means no misses, no false flags, and no wrong severity across all 15 schemes. The eight fatal schemes block the file (INV-062). The seven warning-level ones are warnings (INV-063), as they are at Peppol.

The command-line version reads the same fields and raises the same blocking findings.

## What it still doesn't do

The same open context reaches a delivery party's ids, and those aren't read yet. Neither is Peppol's R056-2, a Dutch VAT number checked inside the tax scheme. Like every format check here, this is not a registry lookup: a well-formed number can still belong to nobody. And we have not seen a real access point reject a payee id. These results come from Peppol's published rules run on generated files.

Method and numbers: `ventures/einvoice-preflight/eval/side-party-ids-peppol-differential-2026-11-17.md`. The checker runs in your browser, and the file is not uploaded.
