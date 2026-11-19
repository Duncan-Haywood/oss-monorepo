# Excel2IDS's own tool, run on the same workbooks (2026-11-19)

**Question.** `eval/excel2ids-tool-2026-11-19.md` listed, from reading the
source of buildingSMART-community's Excel2IDS tool (`Excel2IDS.py` at
`4eb7575`, GPL-3.0, not committed here), where it would write a different IDS
from this venture's reader (`excel2ids.mjs`) or stop. Two earlier sessions
could not run the tool, so those rules were never checked against the tool
itself. This run ran it. Were the rules right, and what did they miss?

**Method.** `eval/excel2ids-sidebyside.mjs` (written by the earlier run, used
unchanged apart from the additions below). Each IDS in the round trip's three
sets is repaired as the page repairs it (`fix.mjs`), written into the
Excel2IDS template by `idsToExcel2Ids`, saved as `.xlsx`, and read twice: by
the tool, imported unchanged through `eval/excel2ids_tool_run.py` (ifctester
0.9.0, openpyxl 3.1.5, tqdm 4.70.1 in a venv; the tool's source was read
first: it only reads the workbook and writes `.ids` files), and by
`excel2idsToIds`. The specifications are compared in the round trip's
canonical form. This run added a field-by-field comparison of the `<info>`
block, and stopped counting an empty `<requirements/>` (which the tool writes
for a prohibited category with no requirements) as a difference: it asks for
nothing, like no `<requirements>`, and is valid in ids.xsd.

```
eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh; eval/fetch-excel2ids.sh
python3 -m venv venv && venv/bin/pip install ifctester openpyxl tqdm
EXCEL2IDS_PYTHON=venv/bin/python node eval/excel2ids-sidebyside.mjs > eval/excel2ids-sidebyside.txt
```

It runs in about 8 seconds.

## Results (`eval/excel2ids-sidebyside.txt`)

| workbooks (purpose filled) | tool stops | specifications | tool = reader | same as original: tool | reader | outputs breaking ids.xsd: tool | reader |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| public IDS files on GitHub (26) | 0 | 124 | 91 | 91 | 124 | 0 | 0 (was 1) |
| IDS-Audit-tool test files (39) | 0 | 211 | 116 | 116 | 211 | 0 | 0 |
| buildingSMART test pairs (256) | 0 | 256 | 61 | 61 | 256 | 0 | 0 |

On the 256 test pairs, the checker's verdict on the tool's output matches the
original's on 255, as the reader's does. The one that changes is
`invalid-entities_must_be_specified_as_uppercase_strings`: the workbook writer
upper-cases the class name, so both readers write a valid IDS where the
original was invalid on purpose.

### What the source-reading rules got right

- **No stops.** The tool read all 321 workbooks the venture writes, and the
  template's sample, without an exception. The earlier run's fix (filling an
  empty purpose with `General`) was what made that true: with no purpose the
  rules said the tool would stop on 316 of 351.
- **`<milestone>LOD400</milestone>`** in every one of the 321 files.
- **IFC version.** 235 specifications differ only in `ifcVersion`: a
  workbook naming several versions (`IFC4 IFC4X3_ADD2`) gets `IFC4X3_ADD2`
  from the tool. Predicted.
- **A typed `TRUE`.** In the template's own sample, the "External doors"
  category's `Pset_DoorCommon.IsExternal` value comes out as
  `<simpleValue>True</simpleValue>` from the tool and `true` from the reader.
  Predicted, cell `T10`.

### What they missed

1. **`<version>None</version>`** in 311 of the 321 files: the tool passes the
   version cell through Python's `str()`, so an empty cell becomes the word
   "None". It is valid against ids.xsd, so nothing flags it; a reader of the
   IDS sees a version called "None".
2. **`_x000D_` written into the IDS.** Excel stores a carriage return in cell
   text as the escape `_x000D_` (ECMA-376 `ST_Xstring`), and so does this
   venture's writer. openpyxl does not undo that escape when it reads cell
   text (it unescapes only table names and headers), so the tool copies
   `_x000D_` into the IDS as typed: 88 specification instructions (44 in
   each) in two of IDS-Audit-tool's "Handover Specifications" files, whose
   instructions have CRLF line ends. The same happens to a workbook typed in Excel whenever a cell
   holds a Windows line end, as pasted text often does.
3. **Two smaller `<info>` differences.** A workbook with no title: the tool
   writes `Untitled` (ifctester's default), the reader `Untitled IDS` (3
   files). A date with a time zone (`2022-11-16+01:00`, a valid `xs:date`):
   the tool drops it, because ifctester parses the date with Python's
   `date.fromisoformat`, which refuses the zone (1 file).

### A fault in this reader the run found

On one public file, `9.13 Buitenruimte` (VDCbase's ILS set), the reader's own
IDS broke ids.xsd and the tool's did not: a category with both a property and
an attribute in its applicability was written in the template's column order
(property, then attribute), but ids.xsd fixes the applicability order as
entity, partOf, classification, attribute, property, material. `rowsToIds` in
`sheet.mjs`, which every spreadsheet path goes through (the generic table,
CSV, `.xlsx` and Excel2IDS), now writes applicability facets in the schema's
order whatever order the rows come in. Requirements take any order in
ids.xsd and are left as written. After the fix: reader 0 of 323 files break
ids.xsd; the round trip (`eval/excel2ids-roundtrip.txt`) is unchanged.

## What changed

- `excel2idsToolNotes` (page, `cli.mjs --from-sheet`) now also names an empty
  version cell (the tool writes `<version>None</version>`) and any cell the
  tool reads holding a carriage return or another character Excel escapes as
  `_xHHHH_` (or a literal `_x0041_`-style text, which Excel stores as
  `_x005F_x0041_`). Over the workbooks this venture writes
  (`eval/excel2ids-tool-notes.txt`): the version note on 312 of 351, the
  carriage-return note in 2 workbooks (88 cells), matching the 311 and 2 the
  tool run showed (the notes run includes workbooks the side-by-side skips).
  "Same apart from LOD400" falls from 35/37/61 to 21/4/0, because an empty
  version cell is now counted as a difference, as it is.
- The workbook's Read me sheet lists those two differences next to LOD400 and
  the IFC version.
- `rowsToIds` writes applicability facets in ids.xsd's order (above).
- Tests: `excel2ids.test.mjs` (version and carriage-return notes, through a
  saved `.xlsx`), `sheet.test.mjs` (applicability order, checked with
  `structure.mjs`).

## Limits

- The tool was run as a Python module with the three globals its `__main__`
  sets, not as the Windows `.exe`; the `.exe` is the same script bundled by
  PyInstaller (`Excel2IDS.spec`), but it was not run.
- The workbooks are ones this venture writes, plus the template's sample.
  A workbook a person filled in for a real project is still missing; that is
  where typed numbers in the matrix (a stop, by the source) would show up.
- ifctester 0.9.0 was used; the tool's README pins no version.
