---
title: "Write an IDS in a spreadsheet, and open one in Excel"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "The free IDS checker now reads an .xlsx or CSV with one row per facet as IDS 1.0, and writes any IDS back as that table. 334 of 334 test files survive the trip."
---

Most information requirements start life in a spreadsheet. A client's BIM
manager lists what each element must carry, row by row, and someone later
types that list into an IDS file, the buildingSMART XML that checkers read.
The typing is where mistakes get in. Reviewing the result is no easier, since
the people who agreed the table rarely read XML.

[IDS Model Check](https://marisstella.app/ids-model-check/) now goes both
ways. Drop an `.xlsx` or `.csv` where the IDS goes and it is written into IDS
1.0, audited and run against the model like any other IDS. Audit any IDS and
*Download as a spreadsheet* gives you the same table back to review in Excel,
LibreOffice or Google Sheets. On the command line, the same thing is
`node cli.mjs --to-sheet spec.ids -o spec.xlsx` and `--from-sheet`.

## One row per facet

An IDS is a list of specifications. Each has facets that pick out elements
(every `IFCDOOR`) and facets those elements must meet (a `FireRating` in
`Pset_DoorCommon`). The table gives each facet its own row:

| spec | section | facet | name | entity | propertySet | property | value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | specification | | Doors are fire rated | | | | |
| 1 | applicability | entity | | IFCDOOR | | | |
| 1 | requirements | property | | | Pset_DoorCommon | FireRating | one of: EI30 \| EI60 |

A value cell holds either the exact value or a restriction written in a few
words: `one of: EI30 | EI60`, `pattern: [A-Z]{2}[0-9]{3}`, `>= 0; < 10`,
`max length: 12`. A leading backslash keeps a cell literal, which also stops
Excel running a value such as `=x` as a formula. A row that cannot become IDS
is reported by its row number, so you fix the cell rather than hunt through
XML. The downloaded workbook has a *Read me* sheet with the rules.

## Does anything get lost?

A table format is only useful if it holds what real files say, so we sent
every IDS file we have through it: IDS to table to CSV or `.xlsx` and back,
then compared the content element by element.

- All **334 of 334** of buildingSMART's own test IDS files came back the same,
  and the checker gave the same verdict on each test model, 334 of 334.
- **55 of 64** IDS files published on GitHub came back exactly. Seven more use
  IDS 0.9 spellings the tool already repairs, and the spreadsheet is made from
  the repaired file, so **62 of 64** survive. One of the two left uses a tag
  IDS 1.0 does not have; the other has no `<info>` block.
- A workbook saved by LibreOffice reads back the same as our own, except that
  two files' Windows line breaks inside instruction text become plain ones.

Two limits worth knowing. We have not yet read a workbook saved by Microsoft
Excel itself, or a requirements table written by a working BIM manager. And
when Excel opens a CSV it turns `1.10` into `1.1` and `007` into `7` before you
see it, so use the `.xlsx` download if your values look like numbers.

The full measurement is in the venture's
[`eval/sheet-roundtrip-2026-11-19.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/sheet-roundtrip-2026-11-19.md).
Everything runs in your browser, and nothing is uploaded. It is a reading of
your files, not professional advice.
