---
title: "A 219 MB IFC model in 1 GB of memory: read the geometry only if someone asks"
seo_title: "Checking a 200 MB IFC model against an IDS in 1 GB of memory"
date: 2026-11-17
tags: [bim, ifc, ids, javascript, performance]
description: "IDS Model Check now reads IFC entity arguments lazily. A 219 MB federated model drops from a 2.5 GB peak to 1.0 GB, with identical reports."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks IFC
building models against buildingSMART IDS files, in the browser or from the
command line. Its README said a 200 MB model needed "about 1 GB of heap". We
had never measured that, and when we did, the figure was wrong.

## The measurement

No public IFC export we could find is near 200 MB, so we built one the way a
coordination model is built: seven real exports from the
[opensourceBIM/IFC-files](https://github.com/opensourceBIM/IFC-files)
collection (the HHS Office MEP, architecture and construction models and the
OpeningDesign Schultz Residence), joined into one STEP file with each file's
entity numbers shifted past the last one. Two MEP models appear twice to take
it past 200 MB. The result: 219 MB and 3,671,279 entities.

Checking it against the three starter IDS files peaked at **2.5 GB**. In
Chromium with the JavaScript heap capped at 1 GB, the page's tab crashed.

## Where the memory went

A STEP file is a list of records like `#12=IFCCARTESIANPOINT((0.,1.,2.));`.
The reader turned every record into an object with an array of parsed
arguments, and every `#n` reference into a small object of its own. In the
HHS MEP export 75% of the records are geometry: cartesian points, poly loops,
faces and face bounds. An IDS check asks about walls, property sets,
classifications and materials. It never looks at a cartesian point unless a
specification applies to every entity in the model.

## The change

The reader now records only each entity's number, type and where its
arguments start. The arguments are parsed the first time a check reads them.
Geometry arguments, the `IfcRepresentationItem` family, are parsed again on
each read and never kept. Type names are shared instead of copied: there is
one `"IFCCARTESIANPOINT"` string, not 1.2 million.

| 219 MB model, starter IDS files | before | after |
|---|---:|---:|
| Time to read, parse and run 3 checks | 12.3 s | 7.5 s |
| Peak memory | 2,520 MB | 1,008 MB |
| Node with a 1 GB heap | out of memory | 7.9 s |
| Page with a 1 GB heap | tab crashed | done in 4.7 s |

Every report is byte-for-byte the same, apart from the timing field. We
checked that on six models against 68 IDS files: the starter set plus 65
IDS files published in public repositories.

## What it does not fix

Some public IDS files have specifications with no entity facet, so they apply
to all 3.7 million entities, geometry included. With all 68 files the 219 MB
model still peaks at 4.7 GB (down from 8.0 GB) and runs 21% slower, because
geometry is parsed again on each read. On the smallest export, a 3.9 MB
construction model that is mostly not geometry, the peak rose by 55 MB. The
ifcXML reader still reads everything up front.

*Update, later the same day:* the 4.7 GB was garbage the collector had not
cleared yet, not memory the run needs; the same run finishes under a 2 GB
heap. A follow-up change also cut its time from 515 s to 111 s:
[IDS specifications that apply to every entity](2026-11-17-ids-specs-that-apply-to-every-entity.md).

The measurements, scripts and the federation tool are in the
[venture's eval folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check/eval)
(`heap-200mb-2026-11-17.md`, `federate.mjs`, `heap-compare.mjs`).
