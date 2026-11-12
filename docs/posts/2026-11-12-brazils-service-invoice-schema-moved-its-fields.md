---
title: "Brazil's national service-invoice schema moved its fields, and last year's files now fail it"
seo_title: "NFS-e Nacional schema 1.04.01: finNFSe required, an offline DPS check"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Three real NFS-e issued in December 2025 fail the 2026-10-20 national schema, all for layout moves. A new offline check names what moved and checks the sums."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) now reads Brazil's national NFS-e, the electronic invoice for services. Brazil has two invoice systems. Goods go on an NF-e, which the state tax office authorises. Services go on an NFS-e, which used to mean one layout per city. The national standard (the *Padrão Nacional*) replaces those city layouts with one schema. A provider's system sends a request called a DPS. The national system checks it and returns the NFS-e, with the DPS inside.

The checker reads both files in your browser, on the [Brazil page](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) or the main checker. Nothing is uploaded.

## The schema moved, and old files fail it

The schema package published on 20 October 2026 (layout 1.04.01, with the IBS/CBS tax-reform groups) changed where several fields go. We ran it on every public NFS-e file we could find in open-source libraries. Three of them are real notes the national system issued in December 2025, from Pará, Ceará and Rio de Janeiro. All three fail the current schema, and every failure is a layout move:

- `finNFSe` (the note's purpose: 0 for a regular note) is now required in `infDPS`, after `tpEmit`. Files built to the earlier layout don't have it.
- In `cServ`, `xDescServ` (the description of the service) now comes after `cNBS`, not before it.
- In the Rio file, an ERP had put `finNFSe` inside the IBS/CBS group and `CST`/`cClassTrib` inside `gIBSCBS`. The current schema puts `CST` and `cClassTrib` at the start of `trib`, and has dropped `vCalcReeRepRes` entirely.

The same Rio file also has a company name written as `MXM & JETTAX`. A bare `&` is not well-formed XML. xmllint refuses the file at that line, but the XML reader our other checks share let it through. The NFS-e check now catches it, says which line, and says to write `&amp;`.

A plain schema error such as "cLocEmi is not expected" leaves you to work out the rest yourself. So when the checker finds one of these moves, the fix says what moved and where it goes now.

## The sums, from the schema's own notes

The schema's field notes state their own formulas:

- the ISSQN base is the service value less the unconditional discount, the adjustments and any municipal benefit;
- the ISSQN is that base times the rate;
- the retentions add up CP, IRRF, CSLL and any ISSQN the customer retains;
- the net value is the service value less both discounts and the retentions;
- the IBS/CBS base, in 2026, also takes off the ISSQN, PIS and COFINS.

The checker tests each one to the cent. All three real notes pass every sum. In the Rio file, for example:

```
IBS/CBS base = 10,000.00 - 500.00 ISSQN - 0.00 PIS - 760.00 COFINS = 8,740.00   (file: 8,740.00)
CBS 0.9%     = 78.66                                                              (file: 78.66)
net          = 10,000.00 - 150.00 IRRF - 465.00 CSLL = 9,385.00                  (file: 9,385.00)
```

The illustrative sample in the nfelib library does not pass. Its IBS/CBS base of 1,000.00 doesn't take off its own 20.00 of ISSQN, so the check flags it.

## The access key's check digit

An issued NFS-e has a 50-digit access key. The schema's note gives its parts (municipality, environment, the issuer's CNPJ or CPF, note number, year and month, a random code, a check digit) but not how the check digit is computed. We tried the NF-e rule: mod 11, with weights 2 to 9 from the right. It reproduces the check digit of all three real keys. A wrong guess would match all three only about 1 time in 1,000. It also matches nfelib's sample. The checker now uses it, and says the rule was reproduced, not read from a specification.

## How we know the schema layer is right

We compared the checker with xmllint on the same four schema files. We took eight files xmllint accepts and changed one thing at a time: deleted a value, added junk, padded with a space, duplicated or swapped an element, and so on. The two gave the same valid-or-invalid verdict on **7,843 of 7,843** changed files. On 1,439 changes aimed inside the IBS/CBS groups, they also agreed on all 1,439.

## What it does not do

It does not check the signature, municipal tax rates and benefits, or the cClassTrib and NBS code tables. It does not read the older city (ABRASF) layouts. We did not find the national system's rejection codes, so findings name none. A clean result is not an acceptance by the national system, and none of this is tax advice.

The code is MIT-licensed, and the measurements are in the [venture README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight).
