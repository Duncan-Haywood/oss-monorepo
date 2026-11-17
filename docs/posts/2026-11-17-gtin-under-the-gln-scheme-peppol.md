---
title: "A GTIN filed under Peppol's GLN scheme gets the GLN check: 581 test files our checker passed"
seo_title: "GTIN under scheme 0088 in a CII invoice line and Peppol's R040"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "In a CII invoice, an item's GlobalID under scheme 0088 meets Peppol's GLN rule, so a mistyped digit bounces the file. Our checker now reads line ids too."
---

All day, [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) has been following one quirk of OpenPeppol's identifier rules: they name no parent element. In CII, the GLN rule's context is just `ram:ID[@schemeID = '0088'] | ram:GlobalID[@schemeID = '0088']`. Every id carrying that scheme gets the check, wherever it sits. Today's earlier changes covered the seller, buyer, payee, tax representative and deliver-to party. The last place on an ordinary invoice is inside the lines.

## The item id

An invoice line's item standard identifier (BT-157) is `SpecifiedTradeProduct/ram:GlobalID`. Usually it's a GTIN, and the right scheme for a GTIN is `0160`, which Peppol has no format rule for. GTINs and GLNs are both GS1 numbers, though, and some systems file the barcode under `0088`, the GLN scheme. Then Peppol's R040 runs a mod-10 check on it. A transposed digit, a dropped digit or a dash from a spreadsheet fails, and the rule is fatal, so the access point rejects the whole invoice over one line's barcode.

Our checker didn't look inside lines for ids. It does now. Every schemed `ID`, `GlobalID` and `URIID` in a CII line is kept and checked against the same rules as the party ids, and findings read "Line 3 identifier does not match the 0088 format". Ids under a scheme without a Peppol rule, such as 0160, are left alone. UBL isn't affected, because its item id sits outside the element Peppol's UBL contexts match.

## Measured

We used the same differential as for the parties. Peppol's published Schematron assertions run with fontoxpath on one side, and our reader plus the check run on the same XML on the other. Valid ids for all 15 schemes, and mutants of them, go into 24 places in a shipped example file. Two of those places are new: the item GlobalID and a line-level ship-to party.

- With the readers on main before this change, seed 7: **581 of 9,472 files disagreed.** Each was a line id Peppol fails and we passed.
- After: **0 of 9,439** (seed 7) and **0 of 9,377** (seed 11).

One difference is deliberate. R040 is a check-digit test of any length, so a correct 14-digit GTIN under 0088 passes Peppol. We still flag it, because a GLN is 13 digits and either way the fix is to use scheme 0160. That case is counted apart, not hidden in the zero.

## Limits

This is a format check, not a lookup in GS1's registry. The results come from Peppol's rules run on generated files, not from a rejection we've seen at a real access point. The command-line version reads the same line ids.

Method: `ventures/einvoice-preflight/eval/line-ids-peppol-differential-2026-11-17.md`. The checker runs in your browser, and the file is not uploaded.
