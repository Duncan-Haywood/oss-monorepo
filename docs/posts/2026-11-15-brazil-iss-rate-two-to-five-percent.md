---
title: "Brazil's ISS has a legal floor and ceiling. Our NFS-e checker now reads them"
seo_title: "NFS-e ISS rate 2% minimum, 5% maximum (LC 116 art. 8-A): checker"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Brazil's ISS rate must sit between 2% and 5%, with three exceptions. We added the check to ABRASF and national NFS-e and ran it on 489 public files."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) already recomputed the ISS on a Brazilian service invoice (NFS-e): base times rate, within a cent. It never asked whether the rate itself could be legal. Now it does.

## The rule

Brazil's municipal service tax (ISS, or ISSQN) is set by each of about 5,570 cities, but a federal complementary law puts a band around it. Lei Complementar 116/2003:

- **art. 8, II**: the maximum rate is 5%;
- **art. 8-A** (added by LC 157/2016): the minimum rate is 2%, and no exemption, base reduction, presumed credit "or any other form" may bring the burden below that, except for list subitems **7.02** and **7.05** (construction) and **16.01** (municipal public passenger transport).

The floor matters to the buyer as much as the issuer. Where the buyer is in another city, a municipal law that charges under 2% is void (art. 8-A § 2), and the tax becomes due where the buyer is (art. 3 § 4). So a buyer who gets an NFS-e at 1.5% may owe its own city's rate on the same service.

The 2025 tax reform adds a schedule. Art. 8-B (LC 214/2025) cuts every municipal rate by 10% in 2029, then 20%, 30% and 40% through 2032, before ISS is replaced by IBS in 2033. The checker scales both ends of the band by the same factor (2029: 1.8% to 4.5%). That is our reading of an article that cuts each city's rate, and the finding says so.

## What the checker does

Two new rules, one per family of layouts:

- **ABR-024** reads `Aliquota` in every ABRASF-family layout, from 2.04 back to the single-file 1.0x systems. In 2.x it is a percentage (`5.00`), in 1.00 a fraction (`0.05`). A value under 1 is tried both ways, so `0.05` passes and `0.5` (0.5% or 50%) does not. The subitem comes from `ItemListaServico`, written as `07.02`, `0702` or `702`.
- **NFSE-024** reads the national NFS-e's `pAliqAplic` (or the DPS's `pAliq`), with the subitem from the first four digits of `cTribNac`. It also checks the burden after a municipal benefit: the ISS over the base before the benefit must not fall under 2%.

Under 2% is not judged for a Simples Nacional or MEI provider, whose ISS share follows its revenue band, or for a special regime, or where the ISS is not due here (export, immunity, exemption, suspension). The report says each one was skipped and why. Over 5% is reported for every file.

## On real files

We searched GitHub for public NFS-e XML carrying a rate and got 489 files the checker reads: 326 ABRASF-family, 163 national. 376 carry a nonzero rate.

| | files |
|---|---|
| with a nonzero rate | 376 |
| drew the new rule | 11 |
| under 2%, Simples Nacional, skipped and said | 8 |

All 11 hits are test resources in one vendor's open-source library, with rates no city may charge: 6.3%, 10% and 1000%. They look like placeholders, not issued documents, and the finding is still right about the file. Nothing else fired: 3%, 5%, 2%, 3.5%, 2.79% and 1.00-style fractions all passed. Full counts are in `eval/iss-rate-band-2026-11-15.md`.

## What it does not do

It does not know your city's own rate for your service. That takes each municipality's ISS law, and we have not read a table of them. It has not been compared with a real city rejection for a rate under 2%. And it reads the law from a mirror of planalto.gov.br, which refused our build host.

Try it on the [main checker](https://marisstella.app/einvoice-preflight/) or the [Brazil page](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html). Everything runs in your browser. It is an offline check, not the city's acceptance, and not tax advice.
