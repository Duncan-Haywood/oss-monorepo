---
title: "Dropdowns in the IDS spreadsheet, checked against 476 real files"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "The free IDS checker's .xlsx download now offers each column's valid words as a dropdown. No real file trips the strict lists; LibreOffice agrees 476 of 476."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) can write any IDS
file as a spreadsheet, one row per facet, and read that spreadsheet back as
IDS 1.0. That helps BIM managers who agree requirements in a table, but a
table is also where typos get in: `requirement` for `requirements`,
`IFCWAL`, a cardinality nobody's checker knows.

The downloaded workbook now has dropdown lists on the columns that take fixed
words. They come from a hidden *Lists* sheet, so Excel and LibreOffice show
them without macros:

- `section` takes only info, specification, applicability or requirements;
- `facet`, `cardinality` and the partOf `relation` warn on any other word but
  let you keep it, because a `min..max` cardinality is legal on a
  specification row;
- `entity`, `propertySet`, `dataType` and `ifcVersion` list the IFC schema's
  concrete classes, standard set names and data types for the versions the
  IDS names. They only suggest. A cell there may hold a restriction such as
  `one of: IFCWALL | IFCSLAB`, so typing something else raises no alert.

## Does it get in the way?

A strict list is only useful if it never refuses a correct file. So we wrote
the workbook for 476 IDS files: 64 published on GitHub, 75 from the
IDS-Audit-tool tests, buildingSMART's 334 test files and our own 3 samples.
Then we compared every cell with its list, the way Excel compares (case
ignored, whole cell):

| column | cells | outside the list |
| --- | ---: | ---: |
| section (strict) | 8,344 | 0 |
| facet (warns) | 6,646 | 0 |
| relation (warns) | 115 | 1 |
| dataType (suggests) | 1,741 | 3 |

The one relation outside its list is a lone `IFCRELFILLSELEMENT`, which the
IDS schema refuses. The warning is right about that cell. The cardinality cells
outside the list are all `min..max` forms on specification rows, which is why
that column warns rather than refuses.

To check the files themselves and not only our script, we opened every
workbook in LibreOffice Calc and ran *Tools > Detective > Mark Invalid Data*.
Calc circled exactly the cells the script predicted in 476 of 476 workbooks.
The round trip back to IDS gives the same results as before.

We could not test Microsoft Excel itself here. The dropdowns use the
standard Office Open XML data-validation markup that Excel documents, but
that is not a measurement. If you open one in Excel and something looks
wrong, the repository takes issues. The method and numbers are in
`ventures/ids-model-check/eval/sheet-dropdowns-2026-11-19.md`.
