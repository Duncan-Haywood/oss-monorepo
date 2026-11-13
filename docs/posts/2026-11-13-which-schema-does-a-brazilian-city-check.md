---
title: "Which schema does a Brazilian city actually check your NFS-e against?"
seo_title: "ABRASF NFS-e: checking against the city's own provider schema"
date: 2026-11-13
tags: [einvoice-preflight, brazil, nfs-e, measurement]
description: "The e-invoice checker now looks up which provider system a Brazilian city runs and checks the NFS-e against that provider's copy of the ABRASF schema. 34 copies read, 198 cities mapped, and it matches xmllint on every file tried."
---

Brazil's municipal service invoice, the NFS-e, mostly follows the ABRASF model. This morning the [e-invoice checker](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) could read all five ABRASF layouts, 2.00 to 2.04. But a city doesn't check your file against "ABRASF 2.04" as such. It runs a system bought from a provider (ISSNet, Fiorilli, GISS, Tiplan and dozens more), and many of those providers publish their own copy of the schema with changes of their own.

So the checker now asks which city the file is for and checks it against that city's provider copy.

## Where the data comes from

OpenAC.Net.NFSe is an MIT-licensed .NET library for sending NFS-e. It ships two things that matter here:

- a list of the 198 cities it supports, each with its provider and layout;
- the provider schemas themselves, one folder per provider and layout.

34 of those copies are a single file in the ABRASF namespace, which is what the checker can compile. Nothing is copied into our tree: the build reads the files at a pinned commit and keeps only the facts it needs.

## What the copies change

16 of the 34 come out identical to an ABRASF layout once compiled. The other 18 differ, and some of the changes matter in practice:

- ISSNet 2.04 and IPM 2.04 take the service item code as free text of up to 5 characters, not a value from the LC 116 list. A file using `1.07` where the list has `01.07` is refused under plain ABRASF 2.04 and fine under ISSNet's copy.
- Tiplan 2.03 already carries the tax reform's `IBSCBS` group and PIS/COFINS fields.
- IPM 2.04 drops the `versao` attribute that ABRASF 2.04 requires.
- SystemPro 2.01 allows up to 10 services in one RPS.

Six copies are not even the layout their folder name gives. Citta 2.03, GovBR 2.03, Pronim 2.03 and SIAPNet 2.00 are ABRASF 2.02 as published, DSF 2.00 is 2.03, and ISSVitoria 2.00 is 2.01. A city listed as running "Citta 2.03" therefore gets the 2.02 schema, and the result tells you so.

## What changed on real samples

Unimake's Uninfe project (also MIT) publishes sample files filed by provider. Tiplan's four tax-reform samples each got two schema findings under ABRASF 2.03, because ABRASF has no IBS/CBS fields. Under Tiplan's own copy they get none. WebISS's tax-reform samples still get the `IBSCBS` finding: the WebISS copy in the mirror is plain ABRASF 2.02, so the newer WebISS schema those samples were built for is not there.

## Measured against xmllint

To check the compiled copies I ran xmllint on each provider's own XSD and compared verdicts, using the checker's fixtures and Unimake's samples, each moved to a city on that provider. 101 of 101 files got the same valid-or-invalid verdict, and so did 8,425 of 8,425 single-change mutants of the valid ones. Tinus is the one copy left out of that comparison: one of its patterns won't compile in libxml2.

## What it doesn't do

The provider list is OpenAC's, not anything the city itself publishes, and a city can change provider. The older 1.0x provider schemas (Ginfes and others) span several files and aren't read yet. A clean result is an offline check, not the city's acceptance.
