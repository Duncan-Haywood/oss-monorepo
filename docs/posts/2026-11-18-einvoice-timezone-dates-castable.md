---
title: "A date with a timezone hid a no-break space from our e-invoice checker"
date: 2026-11-18
tags: [einvoice-preflight, ventures]
description: "We checked which invoice values our checker treats as dates or numbers against Saxon. Dates like 2024-01-31+01:00 were missed, and 30 February was taken."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) warns when a number or date in an e-invoice holds a no-break space (rule INV-065). A spreadsheet export or a copy from a PDF often leaves one behind. JavaScript's `trim()` quietly removes it, so a naive reader sees `1320.00`. An XML Schema processor doesn't remove it, so SdI, KSeF, NAV or a Peppol access point rejects the whole file. Before INV-065 can fire, the checker has to know which values a receiver will read as a number, date or time. That decision is one pattern in `xmlvalues.mjs`, called `CASTABLE`.

This run checked that pattern against SaxonC-HE, the XSLT engine most official validators are built on.

## Timestamps first

Yesterday's run left timestamps out: Polish FA(3) `DataWytworzeniaFa`, the FA(3) transport times and Italian FatturaPA `DataOraConsegna`. We put five kinds of space into each of the 16 date-time fields in our 36-file corpus. INV-065 named the field on all 80 copies, and Saxon refused every mutated value. One item on our list turned out to be empty. Hungarian NAV keeps its timestamps in the request header, not in the invoice data, so there was nothing to measure there.

## Then a wider question

Does `CASTABLE` accept exactly the values Saxon can cast? On real files the answer was yes. All 1,695 distinct leaf values in 113 shipped and corpus files (UBL, CII, PINT, CFDI, NF-e, FatturaPA, ISDOC and others) got the same verdict from both.

Then we fed both a sweep of 5,075 edge cases built on purpose, and it found two faults:

- **A date with a timezone was missed.** `2024-01-31+01:00` is a valid `xs:date`. It is also what Java's JAXB writes for a date by default, and FatturaPA's schema accepts it in `Data`. Our pattern only knew `2024-01-31`, so a no-break space after a timezone date went unreported.
- **Impossible dates were accepted.** `2024-02-30`, `25:00:00` and a `+15:00` zone matched the pattern. With a stray space after them, INV-065 blamed the space for a value no processor reads anyway.

`CASTABLE` now parses dates, times and date-times, with an optional timezone, and checks XSD's ranges: leap years, `24:00:00` only as midnight, zones up to ±14:00. 5,024 of the 5,075 swept values now agree with Saxon. The other 51 are all zones like `+14:01` on a date or time. Saxon accepts those, but the XSD 1.1 spec refuses them, so we follow the spec. The same fix applies to the official-rules route's XML-VALUE-01.

## What we don't know

The mutated files are synthetic. No tax authority's validator was run. Our FatturaPA check IT-009 still calls a timezone `Data` "not a YYYY-MM-DD date". The schema allows one, but whether SdI accepts it is something only a real SdI reply can tell us. The method and every number are in [`eval/datetime-leaves-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/datetime-leaves-2026-11-18.md).
