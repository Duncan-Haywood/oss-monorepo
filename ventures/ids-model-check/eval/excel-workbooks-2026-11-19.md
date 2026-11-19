# Workbooks Excel saved, read as the text a person sees (2026-11-19)

**Question.** The spreadsheet route (`sheet.mjs`, eval/sheet-roundtrip-2026-11-19.md)
was measured on workbooks this venture and LibreOffice wrote with every cell
as text. A BIM manager's table comes from Microsoft Excel, which stores what a
person types as numbers, dates and booleans, not as text. Does `--from-sheet`
read those workbooks as the person sees them, and what does the typing do to
an IDS?

## 1. The reader on 321 real workbooks (Apache POI's test files)

**Corpus.** `test-data/spreadsheet` of Apache POI (Apache-2.0; `git clone
--depth 1 --filter=blob:none --sparse https://github.com/apache/poi.git`, then
`git sparse-checkout set test-data/spreadsheet`): 353 `.xlsx` files collected
from POI bug reports. By `docProps/app.xml`, 252 were saved by Microsoft Excel,
30 by Excel for Mac and 7 by Excel Online; the rest by LibreOffice, POI itself
and others. 18 are fuzzer crash files, encrypted files or cut-short zips.

The reader also reads 15 workbooks openpyxl refuses (Strict OOXML files,
entity-expansion limits, unusual styles), which are left out of the cell
count below. Entity references are never expanded, so POI's XML bomb files
read as short text.

**Method.** `node eval/excel-workbooks.mjs read`, then
`eval/excel-workbooks-ref.py` (openpyxl 3.1.5 as the reference), then
`node eval/excel-workbooks.mjs compare`. The sheet read is the one named
IDS, else the first worksheet; the first 500 rows and 40 columns of it, every
non-empty cell, compared as the text Excel shows: dates by the cell's number
format as ISO 8601 (`xs:date`, `xs:time`, `xs:dateTime`, the forms an IDS
value takes), numbers to Excel's 15 significant digits, booleans `true` /
`false`. `SHEET=<copy of the old sheet.mjs>` gives the "before" column.

| | before | after |
| --- | ---: | ---: |
| workbooks read (of the 336 that are not fuzzer crash, encrypted or cut-short files) | 335 | 336 |
| encrypted workbooks named as such (2) | 0 | 2 |
| cells the same as the reference (321 workbooks both read) | 62,182 of 65,548 | 65,537 of 65,548 |
| date and time cells | 0 of 1,149 | 1,139 of 1,149 |
| number cells | 36,963 of 38,918 | 38,918 of 38,918 |
| boolean cells | 0 of 262 | 262 of 262 |
| workbooks with every cell the same | 255 of 321 | 316 of 321 |
| of those saved by Microsoft Excel | 228 of 282 | 278 of 282 |

What changed in `xlsxToRows`:

- **Dates.** Excel stores a date as a day count with a date number format;
  the reader showed `45292` where the person typed 2024-01-01. Now the cell's
  style is looked up in `styles.xml` (built-in formats 14-22, 45-47 and the
  East Asian ids; custom codes read token by token, quoted text, `\x`, `[Red]`
  and `[$-409]` skipped, `[h]:mm` left as a duration) and the day count turned
  into ISO 8601, with Excel's 1900 leap-year slip and the 1904 date system.
  Format codes are case-insensitive: `DD.MM.YYYY` (in POI's 64508.xlsx) is a
  date, which openpyxl reads as a time, so those 6 cells are counted as
  differing above although ours is the date Excel shows.
- **Numbers.** Excel writes a formula's result, and older versions any
  fraction, with 17 digits (`0.93827160493827155`, `6.1728395061728392E-2`).
  It shows 15. The reader now gives the 15-digit form without an exponent for
  numbers between 1e-20 and 1e21 (`0.0000001`, which `xs:decimal` also
  accepts).
- **Booleans.** A boolean cell came back `TRUE`; IDS writes `true`, and
  `TRUE` matches no IfcBoolean (the audit already warns about it). Excel turns
  a typed `true` into a boolean cell, so a person who typed the right IDS
  value got the wrong one. It now comes back `true`/`false`.
- **Escapes and line breaks.** `_x000D_` (how Excel stores a CR) and other
  `_xHHHH_` escapes are decoded, `_x005F_` keeps a literal one; a literal
  CR LF inside a part is read as LF, as XML 1.0 (2.11) says.
- **Package quirks.** Part names written with backslashes (`xl\workbook.xml`,
  POI's 49609.xlsx, which openpyxl refuses), a workbook found through
  `_rels/.rels`, relationship targets resolved against the workbook's folder,
  a chart sheet in first place passed over, a damaged `styles.xml` or
  `_rels/.rels` skipped instead of failing the sheet.
- **Files that are not .xlsx.** An Excel 97-2003 `.xls` and any workbook saved
  with a password are OLE2 compound files; the page and `--from-sheet` read
  them as CSV and reported nonsense rows. Now `sheetToRows` names them and says
  how to save a plain `.xlsx`; the page's file box also accepts `.xls` so the
  message is reachable.

The 11 cells that still differ: 6 are the `DD.MM.YYYY` dates above; 4 are a
day count of 0 under a date format (a formula pointing at an empty cell,
which Excel shows as `1900-01-00`) and one is 0.67 under `d-mmm`: no date
exists, so the reader keeps the number where openpyxl reports a time; one is
-1 under a date format (Excel shows `#####`), kept as `-1`. The one string
difference is POI's 60289.xlsx, which writes the escape lower-case
(`_x000d_`): Excel's own files use upper case; the reader takes both.

## 2. What a spreadsheet's typing does to an IDS sheet

**Method.** `node eval/sheet-typed.mjs`: each IDS's CSV is opened in
LibreOffice Calc 7 with the standard column type and special-number (date)
detection, which is what Excel does when a CSV is double-clicked, saved as
`.xlsx`, read back, and compared with the same CSV read as text.

Counted over the files whose text CSV makes an IDS at all.

| files | before (old reader) | after |
| --- | ---: | ---: |
| public IDS files, same IDS content as the text CSV | 24 of 56 | 47 of 56 |
| IDS-Audit-tool test files | 32 of 73 | 66 of 73 |
| buildingSMART test pairs | 288 of 334 | 302 of 334 |
| buildingSMART test pairs, checker verdict unchanged | 325 of 334 | 329 of 334 |
| this venture's samples | 2 of 3 | 3 of 3 |

Cells the typing changed, after the fix: 164 line breaks (Calc keeps LF of
a CR LF), 50 numbers written another way (`1.0` to `1`, `42.0` to `42`,
`100000.` to `100000`), 25 booleans written `True` or `TRUE` in the original
that now come back `true`, 1 other. Before the fix 74 more were dates read
as day counts (`2025-01-01` to `45658`). A number's spelling cannot be read
back from a number cell: it is the typing, not the reader. It matters for an
IDS: the 5 test pairs whose verdict still changes are buildingSMART's cases
that `42.0` is not an integer and that `TRUE` is not a boolean. That is why
the workbook we hand out is the thing to edit, not a CSV.

## 3. Does the downloaded workbook survive editing?

**Method.** `node eval/sheet-retype.mjs`: each IDS goes through
`rowsToXlsx`; `eval/sheet-retype.py` opens the workbook in LibreOffice Calc
over UNO and retypes each cell Calc could read as something other than text
(starting with a digit, sign, point or `=`, or true/false) through
`.uno:EnterString`, the input line's own dispatch, so Calc's input reading
runs as on a keyboard; then saves `.xlsx`. (`XCell.setFormula` was tried
first and dropped: it converts even inside a Text cell, which typing does
not.) The IDS read back is compared with the one
the untouched download gives. Before: our workbook's cells had the General
format. After: every cell, and every column's empty cells (so rows a person
adds), have the Text format (`@`, numFmtId 49).

| files | before (General cells, old reader) | after (Text cells) |
| --- | ---: | ---: |
| public IDS files, same IDS content after editing | 24 of 56 | 56 of 56 |
| IDS-Audit-tool test files | 32 of 73 | 71 of 73 |
| buildingSMART test pairs | 288 of 334 | 334 of 334 |
| buildingSMART test pairs, checker verdict unchanged | 325 of 334 | 334 of 334 |
| this venture's samples | 2 of 3 | 3 of 3 |

The two IDS-Audit-tool files left (`RichFile.ids`, `BadRichFile.ids`) have
CR LF line breaks in their instructions; Calc keeps LF when it loads the
workbook, before any typing (the same two noted in
eval/sheet-roundtrip-2026-11-19.md).

Found on the way: the reader's XML-correct handling of a literal CR LF
(read as LF) would have cost those CRs in our own workbook too, which wrote
them literally. The writer now stores a CR as `_x000D_`, as Excel does, and a
literal `_xHHHH_` in a cell as `_x005F_xHHHH_`; `sheet-excel.test.mjs` holds
both. `node eval/sheet-roundtrip.mjs --libreoffice` gives the same numbers as
on 2026-11-19 morning (334 of 334, 55 of 64, 66 of 75; LibreOffice-saved 55
of 64 and 64 of 75).

**Not measured.** Microsoft Excel itself typing into the workbook (no Excel
here; Excel documents the same rule for a Text-formatted cell, but that is
not a measurement), Google Sheets' `.xlsx` export, and a BIM
manager's real table.
