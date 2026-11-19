# Dropdown lists in the downloaded IDS workbook (2026-11-19)

**What changed.** `rowsToXlsx` (sheet.mjs) now writes data validation lists
into the IDS sheet of the workbook the page and `cli.mjs --to-sheet -o x.xlsx`
download, read from a hidden `Lists` sheet through workbook names
(`ids_section`, `ids_entity`, ...):

| column | list | held as |
| --- | --- | --- |
| section | info, specification, applicability, requirements | stop: another word is refused |
| facet | the six facets and ids.xsd's eight info fields | warning: Excel asks, the person may keep it |
| cardinality | required, optional, prohibited | warning (min..max on a specification row is legal) |
| relation | ids.xsd's five partOf relations | warning |
| ifcVersion | IFC2X3, IFC4, IFC4X3_ADD2 | suggest only (several versions share a cell) |
| entity | concrete classes of the versions the file names | suggest only (a cell may hold `one of: ...`) |
| propertySet | standard Pset_/Qto_ names of those versions | suggest only (project sets are legal) |
| dataType | non-select types of those versions | suggest only |

"Suggest only" is a list with the error alert off (`showErrorMessage="0"`):
the dropdown offers the schema's words, and anything typed stays. Each column
also shows a short input prompt (Excel's limits: title 32, text 255
characters; a test holds them). Without schema lists (the page offline) the
five fixed-word columns still get theirs.

**Measured** with `node eval/sheet-dropdowns.mjs` (cells compared with their
list as Excel compares, case-insensitive, whole cell) on the corpora of
eval/sheet-roundtrip-2026-11-19.md:

| corpus | files | section in list | facet in list | cardinality out | relation out |
| --- | ---: | ---: | ---: | ---: | ---: |
| public IDS on GitHub | 64 | 2,847 of 2,847 | 2,328 of 2,328 | 28 (`0..` 24, `1..1` 3, `..unbounded` 1) | 0 of 22 |
| IDS-Audit-tool test files | 75 | 3,714 of 3,714 | 2,901 of 2,901 | 51 (`..unbounded` 45; test junk `Invalid`, `Error`) | 1 of 55 (`IFCRELFILLSELEMENT` alone) |
| buildingSMART test pairs | 334 | 1,669 of 1,669 | 1,335 of 1,335 | 322 (all `..unbounded`) | 0 of 34 |
| this venture's samples | 3 | 114 of 114 | 82 of 82 | 0 | 0 of 4 |

So the one refusing list (section) refuses no cell of any real file, and
facet warns on none. The cardinality cells out of the list are the min..max
forms a specification row may carry (they round-trip as written, and the
warning style lets a person keep one). The one relation out of its list is
the lone `IFCRELFILLSELEMENT` that ids.xsd refuses and the audit already
calls an error: the dropdown's warning is right there. Suggest-only columns:
dataType 1,738 of 1,741 cells in the list; entity 1,094 of 1,246 (the rest
are `one of:` and `pattern:` restrictions and IFC2X3-only names in
multi-version files); propertySet 1,034 of 2,084 (project sets such as
`ePset_...` and `NLSFB`).

**LibreOffice's own reading.** `eval/sheet-dropdowns.mjs --write DIR` writes
the 476 workbooks (files that do not parse as IDS are skipped) and
`python3 eval/sheet-dropdowns-lo.py DIR` opens each in LibreOffice Calc
(LibreOffice 24.2.7.2) over UNO and runs Tools >
Detective > Mark Invalid Data on the IDS sheet: Calc circles exactly the
expected number of cells in **476 of 476** workbooks, and the Lists sheet stays
hidden in 476 of 476. Calc's (and Excel's) "mark invalid" counts suggest-only
columns too, since the alert setting does not change what is invalid, so the
expected count is every out-of-list cell. Re-saved by Calc as .xlsx, all
eight validations and eight names come back (Calc narrows each range to
row 1026). `node eval/sheet-roundtrip.mjs` after the change gives the same numbers as
before it: .xlsx 55 of 64, 66 of 75, 334 of 334 and 3 of 3 back the same,
checker verdicts 334 of 334.

**Not measured.** Microsoft Excel itself (none here): that its dropdown
shows and the stop alert fires on typing is Excel's documented behaviour for
these attributes, not a measurement. Google Sheets' import of the
validations. Whether a BIM manager types fewer wrong words with them.
