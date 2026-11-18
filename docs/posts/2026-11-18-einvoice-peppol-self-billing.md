---
title: "Our e-invoice checker failed every Peppol self-billing invoice. Now it uses the right rules"
seo_title: "Peppol BIS Self-Billing: why every file failed our checker"
date: 2026-11-18
tags: [einvoice-preflight, ventures]
description: "Peppol self-billing invoices name peppol.eu, so our checker ran the Billing rules on them and rejected all nine of OpenPeppol's examples. Here is the fix."
---

In self-billing the buyer writes the invoice. A packing house invoices itself for the apples its growers delivered, a platform does the same for its drivers' trips, and a utility does it for the solar power it buys back from homes. The supplier agrees beforehand and simply gets paid. Peppol has a separate specification for this, **BIS Self-Billing 3.0**. Its identifiers differ from ordinary Peppol BIS Billing: the specification id ends `poacc:selfbilling:3.0`, the process id is `poacc:selfbilling:01:1.0`, and the type codes are 389 (self-billed invoice), 527 (self-billed debit note) and 261 (self-billed credit note).

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) picked its Peppol rules by looking for `peppol.eu` in the specification id. A self-billing id contains that string too, so self-billing files were checked against the **Billing** rules. We ran OpenPeppol's own nine Self-Billing example files through the whole check, the way the page runs it. Billing's rules rejected all nine:

- **R004** (the specification id is not Billing's) and **R007** (the process id is not a billing process): fatal, on all nine.
- **P0112** (type code 389 is allowed only between two German companies): fatal, on eight of the nine. In Billing, 389 is a German special case. In Self-Billing, 389 is the normal invoice type.

The suggested fixes made it worse. They told the sender to switch to Billing's identifiers and type code 380, and a self-billing access point would reject a file changed that way.

## The fix

OpenPeppol keeps Self-Billing on release branches of the `peppol-bis-invoice-3` repository rather than on master, so we compiled the rules from those branches:

| Release | In force | Checks | OpenPeppol's unit-test asserts |
|---|---|---|---|
| Self-Billing 3.0.2 | since 2026-08-17 | 62 | 219 of 219 agree |
| Self-Billing 3.1.0 | from 2027-02-24 | 185 | 349 of 349 agree |

A self-billing UBL file now gets these rules instead of Billing's. The 3.1.0 set runs when you tick the same "check against Peppol BIS 3.1.0" box that previews the Billing release. Any finding that 3.0.2 doesn't raise is marked as new in 3.1.0, with the date it becomes a rejection. For the five rules whose ids are shared with Billing but which expect different values (R001, R004, R007, P0100, P0101), the suggested fix now gives the Self-Billing value. With the new rules, OpenPeppol's nine examples get no official Peppol finding at all.

We fixed one smaller thing along the way. UBL 2.1's EN 16931 binding has no separate debit-note document, so a debit note travels as an `Invoice` with type code 383 (or 527 in self-billing). Our built-in check INV-034 had called every such file a mismatch between document and type code. The reader now goes by the type code.

## What this does not show

The nine examples still fail some of our built-in checks, for the same reason OpenPeppol's ordinary Billing examples do: their VAT numbers, IBANs and BICs are placeholders that fail their checksums. We have not yet seen a real business's self-billing file or an access point's verdict on one. OpenPeppol publishes Self-Billing for UBL only, with no CII version. The full measurement is in [`eval/peppol-self-billing-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/peppol-self-billing-2026-11-18.md).

The checker is free, runs in your browser, and keeps your files on your device. Its results are offline observations, not an access point's acceptance and not tax or legal advice.
