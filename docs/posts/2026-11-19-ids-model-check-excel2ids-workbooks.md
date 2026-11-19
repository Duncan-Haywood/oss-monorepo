---
title: "Excel2IDS workbooks, read in the browser and written back"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "The free IDS checker now reads a filled Excel2IDS template as one IDS per purpose and puts any IDS back into it. 309 of 309 public specs that fit survive."
---

A lot of BIM managers don't write IDS files directly. They fill in a
spreadsheet first, and one popular layout is buildingSMART-community's
[Excel2IDS](https://github.com/buildingsmart-community/Excel2IDS) template.
Asset categories go across the top ("External doors", "Steel columns and
beams"). Requirements go down the side, one per row. You put an `X` where a
category needs a requirement. A Windows `.exe` then turns the workbook into
one IDS file per discipline.

[IDS Model Check](https://marisstella.app/ids-model-check/) now reads that
workbook as it is. Drop the filled `.xlsx` where the IDS goes. You get one IDS
per purpose, each audited and ready to run against a model, with buttons to
check or download each one. You don't need Windows or an install, and the
workbook stays in your browser. The command line does the same with
`node cli.mjs --from-sheet book.xlsx -o out.ids`, which writes `out_MEP.ids`,
`out_STR.ids` and so on. Add `--by-phase` to split by the template's
"Milestone (phase)" column too.

It also works the other way, which Excel2IDS can't. After an audit, *as an
Excel2IDS workbook* lays an existing IDS out in the template so a team can
review it in Excel. A requirement shared by several categories becomes one
row with several `X` marks.

## How it was checked

The test was a round trip: take real IDS files, write each into the template,
save it as `.xlsx`, read it back and compare. The comparison treats as equal
only what the template writes out by its own rules. For example, an
applicability with no `minOccurs` comes back as "required".

| files | fit the template | came back the same |
| --- | ---: | ---: |
| 64 IDS files published on GitHub | 309 of 507 specifications | 309 of 309 |
| buildingSMART's IDS test pairs | 256 of 334 | 256 of 256 |
| IDS-Audit-tool test files | 334 of 807 | 334 of 334 |

On the test pairs, the checker gives the round-tripped file the same verdict
255 times out of 256. The odd one out is a test file that must fail because
it writes a class as `IfcWall`. The reader upper-cases that to `IFCWALL` on
purpose and says so, so the file now passes.

Most of the specifications that don't fit fail for one of three reasons. 92
have a `partOf` requirement, which the template has no column for. 78 ask for
a material without naming one, which the template can't express, because it
builds a material facet only from a filled cell. The rest use ranges and
lengths, which the template's own instructions say it doesn't support. In
every case the specification is left out and the reason is listed. Nothing is
changed silently.

## Two things found along the way

The template's own sample workbook has a mistake that its rules reproduce.
Its "External doors" column is marked on a row that names `IFCWALL`
`PARTITIONING`, an attribute pattern and the cardinality "prohibited". In the
template, a row builds one facet for each filled column, and an entity facet
takes no cardinality. So the row becomes a requirement that every external
door be a wall, and no door can pass it. The audit flags this as an error
before any model is read.

Reading the Excel2IDS tool's source also turned up places where its output
differs from what its instructions describe. It writes booleans as `True`
where IDS wants `true`. On a `REPLACEME` row in the property-name column it
drops the row's value and URI. It stamps every file `LOD400`. This reader
follows the instructions instead. We could not run the tool itself here, so
those differences come from reading its code, not from a side-by-side test.
The method and every count are in
[the write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/excel2ids-2026-11-19.md).

IDS Model Check is free and MIT-licensed. Its results are a check of a file
against a specification, not professional advice. Review the IDS you hand
over.
