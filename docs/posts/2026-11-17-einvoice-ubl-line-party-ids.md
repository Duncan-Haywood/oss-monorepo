---
title: "Peppol checks party ids inside UBL invoice lines too, so now we do"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "Peppol's id rules name no parent, so a line's delivery party GLN can bounce a UBL invoice. Our checker missed 711 of 9,490 such files; now it misses none."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it goes to a Peppol access point. Since this week it runs OpenPeppol's identifier rules (the PEPPOL-COMMON set: GLN mod-10 checks, Swedish and Norwegian org numbers, Danish CVR, Belgian and Dutch numbers and so on) on every party id the way Peppol does. This run closed the last gap we knew of in UBL files: ids inside an invoice line.

## Why a line can bounce a file

Peppol's UBL rules match ids by shape, not position. The context is `cbc:EndpointID`, `cac:PartyIdentification/cbc:ID` or `cbc:CompanyID`, each with a `schemeID`, and no parent element is named. EN 16931 has no line-level parties, but UBL 2.1 lets an invoice line carry its own `cac:Delivery/cac:DeliveryParty`, and an item can name its `ManufacturerParty`. ERPs that ship each line to a different store fill these in. If that store's GLN has a typo, Peppol's rule R040 fails it, and the rule is fatal: the access point rejects the whole invoice.

Our UBL reader only looked at the header-level delivery, so it never saw these ids.

## What changed

Both readers, the page's JavaScript and the Python CLI, now keep every schemed id inside a UBL line, the same way CII lines were already handled. The checker reports a bad one as "Line 1 identifier does not match the 0088 format...", pointing at the line.

One difference between the two syntaxes is worth knowing. In CII, an item's standard identifier (a GTIN, BT-157) is a `ram:GlobalID`, which Peppol's CII context does reach: file a GTIN under 0088 (the GLN scheme) instead of 0160 and a mistyped check digit bounces the file. In UBL the same id is `cac:StandardItemIdentification/cbc:ID`, which no COMMON context reaches, so Peppol lets it through and so do we.

## How we know it matches

The check is measured against Peppol's own rules, not against our reading of them. A differential script draws valid ids for the 15 schemes Peppol checks, makes typo mutants of them (a changed digit, a swap, a dash, a country prefix), writes each into one of 28 places in a real example invoice, and asks two questions of the same XML: does Peppol's rule fail it, and does our checker flag it?

| run | files | Peppol fails | disagreements |
|---|---|---|---|
| before, seed 7 | 9,490 | 6,299 | 711 |
| after, seed 7 | 9,457 | 6,299 | 0 |
| after, seed 11 | 9,385 | 6,307 | 0 |

All 711 misses were line-level party ids. The full venture test suite (2,662 tests) passes. The method and numbers are in [the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/ubl-line-ids-peppol-differential-2026-11-17.md).

This is a format check. It doesn't look ids up in a registry, and it isn't an access point's verdict. It does catch the typo before the access point does.
