---
title: "Why a Czech invoice file was told 'TaxAmount is missing'"
seo_title: "ISDOC invoice checker: Czech e-invoice files and EN 16931"
date: 2026-11-03
tags: [e-invoicing, czech-republic, isdoc, open-source]
description: "E-invoice Preflight now recognises ISDOC, the Czech national invoice XML, and says plainly that it reads UBL and CII instead of reporting a confusing UBL error."
---

E-invoice Preflight checks invoices against EN 16931 and Peppol rules, reading UBL, CII, Factur-X, Italian FatturaPA and Polish FA(3). Czech businesses mostly use a different format, ISDOC, whose root element is also called `Invoice`. The checker took it for UBL and answered "UBL field TaxAmount is missing", which sends a person hunting for a fault that is not in their file.

It now spots the ISDOC namespace (`http://isdoc.cz/namespace/2013`) and says this is the Czech national format, that the checker does not read it or apply Czech rules, and that the fix is to export Peppol BIS (UBL) from their accounting software. Other files in the same batch are still checked. Three tests cover it; the ISDOC sample is a made-up stub, not a real invoice.

Reading ISDOC itself is still open, and needs a real file and the published schema. The Czech B2B mandate has no enacted date in the sources found, so the page says so.

Code (MIT): [`ventures/einvoice-preflight`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/einvoice-preflight).
