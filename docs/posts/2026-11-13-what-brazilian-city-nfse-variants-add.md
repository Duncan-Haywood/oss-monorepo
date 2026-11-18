---
title: "What Brazil's city NFS-e systems add to the ABRASF schema"
seo_title: "ABRASF NFS-e 2.01 and 2.02: what provider variants add"
date: 2026-11-13
tags: [einvoice-preflight, brazil, nfs-e, measurement]
description: "The e-invoice checker now reads ABRASF NFS-e 2.00 to 2.02. It matches xmllint on 48 published files, and the invalid ones show what city systems add."
---

Brazil invoices services on an NFS-e, and most cities that have not moved to the national system take it through a web service built on the ABRASF model. There are five ABRASF layouts in use, 2.00 to 2.04. This morning the [e-invoice checker](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) read the schema for 2.03 and 2.04 only. A file in 2.01 or 2.02, which is what a lot of smaller cities still run, got the identifier and arithmetic checks but no structure check.

It now reads all five. The schemas come from the same MIT-licensed mirror as before. The five layouts share most of their definitions, so the data file only grew from 64 KB to 70 KB.

## The differences are small and they matter

- 2.00 writes `DataEmissao` and `Competencia` as date-times. From 2.01 on they are plain dates.
- 2.01 to 2.03 call the buyer `Tomador`. In 2.04 it is `TomadorServico`.
- 2.04 moved the batch's provider details into a `Prestador` group.

A file sent with the wrong layout number gets refused for one of these, and the city's error message usually doesn't say why.

## Measured against xmllint

I searched GitHub for ABRASF files that state layout 2.00, 2.01 or 2.02 and got 185 files. 126 were not invoices, mostly provider configuration files that only mention the namespace. That left 48 distinct invoice files. For every one of the 48, the checker and xmllint gave the same valid-or-invalid verdict: 21 valid, 27 invalid. I then made 3,059 single-change mutants of the valid files (a value removed, an element doubled, two swapped and so on), and the two agreed on all 3,059.

## What the invalid files say

The 27 invalid files were not misreads, and most of them are vendors' own sample files. They show where city systems depart from the model:

- AVMB's 2.02 samples put a `Token` inside the batch.
- Fintel's 2.02 samples add a `DataPagamento` to the RPS.
- Sonner's and WebISS's newer samples carry the 2026 tax-reform fields (`CodigoNBS`, an `IBSCBS` group), which ABRASF's schema does not have yet.
- Digifred's 2.00 samples leave out the signature that the 2.00 schema requires.
- A real reply from one city's system leaves out the required `OrgaoGerador` and uses a 15-character verification code where 2.01 allows 9.

That changed one fix message. If a file is meant for an AVMB city, "remove `Token`" is the wrong advice. The finding still stands, because the ABRASF schema does refuse the element, but the fix now says whose extension it is and to keep it if the city runs that provider's system. That applies only to elements found in a provider's own published samples.

## What is next

The mirror also has the providers' own schemas (ISSNet, WebISS, Fiorilli, GINFES and about 40 more). The next step is to check a file against the schema its city actually uses, not only against the model. The full measurement is in the venture's [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight).

This is an offline structure check. It is not the city's acceptance, and it is not tax advice.
