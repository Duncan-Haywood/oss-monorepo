# Where Excel2IDS's own tool would read a workbook differently (2026-11-19)

**Question.** A BIM manager who fills in buildingSMART-community's
[Excel2IDS](https://github.com/buildingsmart-community/Excel2IDS) template can
turn it into IDS two ways: the project's Windows tool (`Excel2IDS.py`, GPL-3.0,
built into an `.exe`) or this venture's reader (`excel2ids.mjs`, MIT). The
earlier slice (`eval/excel2ids-2026-11-19.md`) listed six places, read from the
tool's source, where the two differ. Which cells in *a given workbook* would
make the tool write a different IDS, or stop with no IDS at all? And does the
workbook this venture writes ("as an Excel2IDS workbook") actually open in the
tool, as its Read me sheet said?

**What was built.** `excel2idsToolNotes(rows)` in `excel2ids.mjs`: the
tool's behaviour at commit `4eb7575` as its source shows it, written fresh
(no code from the tool), checked against one workbook cell by cell. It
returns `stops` (the tool raises an exception and writes no file) and `notes`
(the tool writes something else), each with its row and column. Rules:

| what in the workbook | the tool | this reader |
| --- | --- | --- |
| sheet not named exactly `Requirements` | stops (KeyError) | finds the template by its labels |
| rows or columns inserted | reads the fixed cells in `settings.json` (J2:J8, row 18, column Q, from R19) | finds the labels |
| a category with no purpose (with requirements, or prohibited) | stops (`re.split` on `None`, TypeError) | one IDS with no `<purpose>` |
| a toggle typed as text (`FALSE`, `no`) | on (Python truth) | off |
| a typed `TRUE`/`FALSE` in a value cell | `True`/`False` (`str(bool)`) | `true`/`false` |
| a matrix cell Excel stored as a number or boolean | stops (`.strip()` on it, AttributeError) | reads the value |
| a mark that is not X on a row with no `REPLACEME` | adds the previous REPLACEME facet again; stops if there was none | leaves it out with a warning |
| `REPLACEME` with spaces around it | does not see it (exact compare) | trims |
| a REPLACEME row read before any X | stops (UnboundLocalError on `instructions`) | reads it |
| a REPLACEME row's instructions | those of the last X row the tool read, in any column | the row's own |
| a REPLACEME entity's predefined type | the one carried from the last X row or the category | the row's own |
| a REPLACEME property name or set with a value or URI | drops them; writes them onto the property facet carried from an earlier row or the category's applicability (or stops if none) | keeps them on the row's facet |
| applicability cardinality `Prohibited`, `Optional` | compares with the lower-case word exactly, so required | lower-cases |
| requirement cardinality `Required`, data type `IfcLabel`, class `IfcWall` | as typed (it strips spaces, changes no case) | `required`, `IFCLABEL`, `IFCWALL` (warned) |
| IFC version cell other than exactly `IFC2X3`, `IFC4`, `IFC4X3_ADD2` | `IFC4X3_ADD2` | each named version kept (`IFC4X3` read as `IFC4X3_ADD2`) |
| every IDS | `<milestone>LOD400</milestone>` (a placeholder in its code) | no milestone, or each phase when split by phase |

To tell a typed boolean or number from text, `xlsxToRows` now records which
cells Excel stored as booleans (`t="b"`) or numbers (`rows.cellTypes`); a CSV
has no types, and there `false` and `0` toggles are taken as the boolean and
number they most likely were. Once the layout has moved, no cell-level note is
given: the tool would be reading other cells, and guessing which is not useful.

Page: after an Excel2IDS workbook is dropped, a folded list "Where Excel2IDS's
own tool would write a different IDS from this workbook" (or "would stop on
this workbook") with the row and column of each. CLI: `--from-sheet` prints
`excel2ids tool stops|differs (row, col): ...` on stderr.

**The writer, fixed.** Run over the workbooks this venture writes, the rules
showed the download's promise ("Excel2IDS's own tool reads it too") was false
for most files: an IDS with no `<purpose>` left the template's purpose row
empty, and the tool stops on that. The writer (`idsToExcel2Ids`) now fills the
purpose with `General`, the tool's own default name (`add_to_ids`), says so in
a separate `tool` list (shown beside the download, not as something lost), and
writes entity names upper case. The Read me sheet now names the two
differences that remain (the `LOD400` milestone; several IFC versions become
`IFC4X3_ADD2`), and a workbook with several versions says so at download.

**Method.** `node eval/excel2ids-tool-notes.mjs > eval/excel2ids-tool-notes.txt`
(after `eval/fetch-audit-corpus.sh`, `eval/fetch-testcases.sh`,
`eval/fetch-excel2ids.sh`): the template's sample as it ships, and every
workbook written from the round trip's three IDS sets, saved as `.xlsx` and
read back.

**Results** (`eval/excel2ids-tool-notes.txt`).

| workbooks this venture writes | written | tool stops, before the fix | after | same apart from LOD400, after |
| --- | ---: | ---: | ---: | ---: |
| public IDS files on GitHub | 51 | 20 | 0 | 35 |
| IDS-Audit-tool test files | 44 | 40 | 0 | 37 |
| buildingSMART test pairs | 256 | 256 | 0 | 61 |

- Before the fix, every stop was the empty purpose (546 category columns in
  316 workbooks); 7 entity names in 5 workbooks would have been written as
  typed (`IfcProjectedCRS`). After it, what differs is only the IFC version:
  218 workbooks name several versions (`IFC2X3 IFC4` in 205), which the
  template's single cell holds but the tool writes as `IFC4X3_ADD2`. That one
  cannot be fixed in the workbook; it is now said at download.
- The template's own sample: no stop, and one cell besides the milestone.
  `T10`, the property value in the "External doors" category's
  applicability (`Pset_DoorCommon.IsExternal`, data type `IFCBOOLEAN`), is a
  typed `TRUE` (`t="b"` in the sheet XML), so the tool writes
  `<simpleValue>True</simpleValue>`. That is not an `xs:boolean` value, so by
  IDS 1.0 it matches no door, and the tool's MEP IDS selects nothing for that
  category (it is optional, so it passes silently). This reader writes `true`.
  It is the same category whose `IFCWALL` row the earlier slice found.
- The round trip (`eval/excel2ids-roundtrip.txt`) is unchanged: 309 of 309,
  334 of 334 and 256 of 256 specifications come back the same, verdicts same
  255 of 256; a filled-in `General` purpose is not counted as a change.

**Run since (same day):** `eval/excel2ids-sidebyside-2026-11-19.md` ran the tool on these workbooks; the rules held and two were added (an empty version cell written as `None`, a carriage return written as `_x000D_`).

**Not measured (at the time).** The tool's own output. `eval/excel2ids-sidebyside.mjs` and
`eval/excel2ids_tool_run.py` are written to run it unchanged on the same
workbooks (through `pip install ifctester openpyxl tqdm`) and compare its IDS
with this reader's, spec by spec, against ids.xsd and on buildingSMART's test
pairs. This session's sandbox refused to run the fetched third-party script,
as the previous one's did, so the rules above are from reading the source,
and a session allowed to run it should run the side-by-side to confirm or
correct them. A workbook filled in by a person for a real project is still
missing too; the only public one is the template's sample.
