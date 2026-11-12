---
title: "A sort code is not a typo: what an e-invoice's bank field is allowed to hold"
seo_title: "EN 16931 BT-86: BIC or clearing code, checked against the IBAN"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Our e-invoice checker failed every sort code, BLZ and routing number in BT-86. The standard allows them. Now it accepts them and checks them against the IBAN."
---

The [e-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an invoice before it goes to a Peppol access point or a tax portal. One of its built-in checks, `INV-026`, looked at the bank identifier (EN 16931 business term BT-86) and failed anything that wasn't shaped like a BIC: four letters, a country, a location, maybe a branch.

That check was too strict. BT-86 names the bank that holds the account, and the standard lets it be a BIC *or a national clearing code*. A UK supplier who writes their sort code there, a German one who writes the Bankleitzahl, an American who writes a routing number, or an Australian with a BSB has filled the field correctly. Our checker told all of them the file was broken. The PINT route for Singapore and Australia already ignored the check for this reason. EU files had no such way out.

## What it does now

The value is read as one of three things:

- **a BIC**, checked as before, with its country compared to the IBAN's;
- **a clearing code**: 3 to 11 digits (sort code, BLZ, ABA, BSB, Italian ABI/CAB, French code banque and guichet), or an Indian IFSC;
- **neither**, which is still `INV-026`. A placeholder like `BA11` or `[BIC]` fails, as it should.

Nine digits that start with a US Federal Reserve district prefix are read as an ABA routing number, and that number has a check digit (weights 3, 7, 1, sum divisible by 10). A bad one is an error. If it starts with 0 it's only a note, because Canada's EFT routing form and Russia's BIK also start that way.

## The check a BIC never allowed

A clearing code turns out to be *more* checkable than a BIC. In most European IBANs the domestic bank code sits at a fixed place: the German BLZ is the first eight BBAN digits, the UK sort code is the six digits after the bank letters, the Italian ABI follows the CIN letter. So when the invoice has both an IBAN and a clearing code, we compare them. `37040045` next to `DE89 3704 0044 …` names a different bank, and that's now `INV-027`. For 23 countries we take the positions from the SWIFT IBAN registry, the same structure table the IBAN check already uses. Swiss bank codes match with or without their leading zeros, since people write UBS as `230` as often as `00230`.

## What it doesn't do

It doesn't look anything up. A well-formed sort code may not belong to any bank, and a matching BLZ doesn't prove the account is real. Countries outside the 23 aren't compared. The Python package has no note level, so the leading-0 routing note doesn't show there. The tests use published routing numbers and the standard example IBANs, not real customer files. The work is in `ventures/einvoice-preflight/bic.mjs`, with the details in the README under "BT-86 clearing codes".

This isn't legal or tax advice. A preflight check catches typos before a portal does. It doesn't decide whether a portal will accept a file.
