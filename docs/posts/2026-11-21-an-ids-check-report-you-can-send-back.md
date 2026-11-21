---
title: "An IDS check report you can send back: one HTML file, and where 11.6 million failures go"
seo_title: "A shareable HTML report for IDS model checks"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "The free IDS checker now writes one offline HTML report: verdict, the requirements that fail most, and every failing element with its GlobalId."
---

A BIM manager who checks a consultant's model against an IDS has to send the
result back to someone. [IDS Model Check](https://marisstella.app/ids-model-check/)
already wrote BCF for the BIM tool and CSV and JSON for scripts. None of those
is something a project lead opens and reads. So it now writes a report too:
press *Download report (HTML)* after a check, or run

```
node cli.mjs model.ifc spec.ids --html report.html
```

It is one file with nothing loaded from outside, so it opens offline, comes
through as an email attachment and prints. It holds the verdict, a table of
every specification with its pass rate, every failing element with its
GlobalId and the reason, and three tallies a reader would otherwise build by
hand from the CSV:

- **Where to start.** The requirements that fail most often. In the HHS
  Office architect model checked against a building-performance IDS from the
  bim2sim project, 112 walls fail one requirement:
  `Pset_WallCommon.ThermalTransmittance` is missing. That is one parameter
  mapping in the export settings, not 112 fixes.
- **Failures by IFC class.** Which discipline the failures belong to.
- **Elements failing the most specifications.** The worst-modelled elements.

## Checked on public files

Four real exports (three HHS Office models and the Schultz Residence, all
IFC2X3) and the sample house, against 64 public IDS files: 320
reports. Each was read back and compared with the check it came from. It
wrote 99,303 failure rows, the same number the checks listed, and in every
file the summary's fail counts were exact. Each of the 14.5 million failure
reasons went under a requirement its specification names, and every file's
tags were balanced. The mean report is 153 KB; the largest is 2.4 MB.

## Where the first version broke

The first run wrote every failing element, and it crashed on the HHS MEP
model. Some public IDS files contain a specification with no entity facet,
which applies to every one of the model's 665,224 entities. With every row
written, the page passed JavaScript's 512 MB limit on a single string. Now
each specification writes its first 1,000 failing elements and states the
total ("Showing 1,000 of 665,224 failing elements"). The counts and tallies
still cover every failure, and the CSV and JSON keep every row. Against the Dutch NL-BIM Basis ILS
that model has 5.3 million failing results. The report takes 8.7 s to write
after a 27 s check. The first version of the tallies took 17 s.

The method and every number are in
[`eval/html-report-2026-11-21.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/html-report-2026-11-21.md).
No consultant or BIM manager has read one of these reports yet. If you check
models against an IDS and the report misses what you would send, say so.
