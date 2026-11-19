# An IDS as a spreadsheet and back (2026-11-19)

**Question.** Information requirements are usually agreed in a spreadsheet
(a client's requirements table, a LOIN matrix) and typed into an IDS by hand
afterwards. Can one table form hold what real IDS files say, so a person can
write requirements in Excel and get IDS 1.0, or open an IDS in Excel to review
it, without losing anything on the way?

**What was built.** `sheet.mjs`: one row per facet (columns `spec, section,
facet, name, ifcVersion, entity, predefinedType, propertySet, property,
dataType, attribute, system, value, relation, cardinality, uri, instructions,
description, identifier`), a value cell holding either the exact value or a
restriction written as clauses (`one of: EI30 | EI60`, `pattern: ...`,
`>= 0; < 10`, `length: 4`, `base: integer`, `note: ...` for an
`xs:annotation`), a leading backslash for a literal (and for a cell Excel would
run as a formula). Readers and writers for CSV (comma, semicolon or tab, found
from the header) and `.xlsx` (written with inline strings and a "Read me"
sheet; read with shared strings, rich-text runs, cells without references, the
sheet named IDS or else the first). No dependencies: the zip writer is the one
`bcf.mjs` already had, the reader `zip.mjs`'s. Page: drop an `.xlsx`/`.csv` as
the IDS; after an audit, "Download as a spreadsheet (.xlsx / .csv)". CLI:
`cli.mjs --to-sheet spec.ids -o out.xlsx`, `cli.mjs --from-sheet in.xlsx -o out.ids`.

**Method.** `node eval/sheet-roundtrip.mjs --libreoffice` (after
`eval/fetch-audit-corpus.sh` and `eval/fetch-testcases.sh`). Each IDS goes
IDS -> rows -> CSV -> rows -> IDS, and the same through our `.xlsx`; with
`--libreoffice` the CSV is also imported by LibreOffice Calc 7 (every column
as text, UTF-8) and saved as `.xlsx` by it, so the reader sees a workbook
an office suite wrote (shared strings, its own zip). "Same content" is
`canonicalIds`: element names, attributes and leaf text equal; layout,
comments, namespace prefixes and `xsi:schemaLocation` are not content. On
buildingSMART's test pairs the round-tripped IDS is also run against the
pair's model and its verdict compared with the original's.

**Results.**

| files | CSV | our .xlsx | LibreOffice-saved .xlsx |
| --- | ---: | ---: | ---: |
| buildingSMART IDS test pairs (suite `870f9c4`) | 334 of 334 | 334 of 334 | (not run) |
| public IDS files on GitHub (`eval/real-ids-files.txt`, 64 readable as XML) | 55 of 64 | 55 of 64 | 55 of 64 |
| IDS-Audit-tool test files (75 readable as XML) | 66 of 75 | 66 of 75 | 64 of 75 |
| this venture's three starter IDS files | 3 of 3 | 3 of 3 | 3 of 3 |

- On the 334 test pairs the checker's verdict on the round-tripped IDS equals
  its verdict on the original, 334 of 334.
- Of the 9 public files that differ, 7 use IDS 0.9 forms (`minOccurs` on
  `<specification>` and on facets, property `<name>`, `datatype`) that
  `fix.mjs` already repairs; the page and `--to-sheet` make the sheet from the
  repaired file (`sheetFromIds`), and all 7 then come back equal to the
  repaired file. So **62 of 64** public files survive the path a person takes.
  The other two: one writes `<n>` for `<name>` throughout (the single public
  file with that tag, already noted in NEXT.md; the sheet notes it and leaves
  it out), and one has no `<info>`, which ids.xsd requires; the sheet's IDS
  gets `<info><title>Untitled IDS</title>`.
- The 9 IDS-Audit-tool files that differ are its deliberately broken files
  (`xs:totalDigits` in a restriction, an `<unexpected>` element, a missing
  `<applicability>`, `cardinality="Optional"` written back lower-case) and two
  IDS 0.9 files that come back equal once repaired. Every loss is listed per
  file as a note ("attribute X is not kept", "<value> holds something a cell
  cannot say"); nothing is dropped silently except the lower-casing of a
  cardinality word, which repairs the file.
- LibreOffice changes two more files: their `instructions` hold CR LF line
  breaks (`&#13;&#10;`), and a spreadsheet cell keeps only LF. The text
  reads the same.

**Not measured.** A workbook saved by Microsoft Excel itself (none here;
Excel writes the same shared-strings layout LibreOffice does, but that is not a
measurement), Google Sheets' export, and a requirements table written by a
real BIM manager (the hand-written table in `sheet.test.mjs` is ours). Excel
opening a CSV turns `1.10` into `1.1` and `007` into `7` before anyone sees
it; the `.xlsx` path does not, so the page offers `.xlsx` first.
