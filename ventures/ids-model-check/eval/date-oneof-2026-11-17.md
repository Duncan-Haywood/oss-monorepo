# IDS editor: "one of" rows on dates, date-times and durations (2026-11-17)

**Question.** IDS 1.0's DataTypes table gives IFCDATE an `xs:date` base,
IFCDATETIME `xs:dateTime`, IFCTIME `xs:time` and IFCDURATION `xs:duration`.
Since `eval/date-ranges-2026-11-17.md` the editor writes a **between** row on
those bases, but a **one of** row on the same property still wrote
`<xs:restriction base="xs:string">`, and an opened file that listed dates on
`xs:date` (buildingSMART's IDS-Audit-tool test files do, 29 times) was held as
read-only XML. That note's "Not done" said fixing it "would change every file
the editor has written". Can a one-of row write the DataTypes base without
changing an earlier file, and do the checkers read the two bases the same way?

## What landed

- `editor.mjs`: a one-of row on a date, date-time, time or duration property
  or attribute writes its enumeration on that type's XSD base
  (`oneOfValue`, the same `temporalType` the range row uses). Other one-of
  rows (text, standard enumerations) are unchanged: `xs:string`.
- Opening a file: a temporal one-of on its DataTypes base opens as a row. One
  on `xs:string`, as this editor wrote it before today, also opens as a row
  and keeps `xs:string` (`oneOfBase`), so every file the editor wrote before
  is written back byte for byte. Any other base (`xs:integer` on a date) is
  still kept as written.
- `editor.html`: the row says which base it is written on and that values are
  compared as written ("2024-05-01Z does not match 2024-05-01", "P24M does
  not match P2Y"). A row opened on `xs:string` shows **Write on xs:date**
  (or `xs:duration`, ...), counted as `editor_oneof_base`. Changing the
  property, kind or data type drops the kept base.

## Do the checkers read the bases the same way?

IfcTester 0.9.0's `Restriction.__eq__` (`ifctester/facet.py`) compares an
enumeration with `cast_to_value(v, other)`, the model value's own Python type,
and never looks at the base; for a date that is a string compare. This
checker's `simpleMatch` also compares the text. So the base changes nothing
for either, which `eval/date-oneof.mjs` measures on the 61-door model of
`eval/date-ranges.mjs` (Pset_Warranty start and end dates spread over 2022 to
2027, one period P2Y), each of 8 one-of rows written on both bases.
Full output: `eval/date-oneof.txt`.

| Row | Doors failing (both bases, both checkers) |
| --- | ---: |
| WarrantyStartDate one of all 60 start dates | 0 |
| one of the 30 earliest | 31 |
| one of 2024-05-01 | 59 |
| one of 2024-05-01Z, 2024-05-01+00:00 (the same day with a zone) | 61 |
| WarrantyEndDate one of all 61 end dates | 0 |
| one of the ten latest | 51 |
| WarrantyPeriod one of P2Y | 60 |
| one of P24M, P730D | 61 |

- Same verdict and failing doors on `xs:date` as on `xs:string`: **8 of 8**
  in this checker. IfcTester 0.9.0 (with ifcopenshell 0.9.0.post1) against
  this checker: **16 of 16** the same, failing sets included.
- Reopened: 16 of 16 rows editable, 0 kept as written, the file written back
  identical.
- The last date and the last duration rows are where a value reading would
  differ: in XSD's value space P24M equals P2Y, and a date with `Z` is the
  same day as one with `+00:00`. Both checkers compare the text, so a one-of
  list has to name each form the model writes; the row says so. A range
  compares values (in this checker; IfcTester fails every object on a range).

## Opened files

`node eval/editor-open.mjs` (corpora from `eval/fetch-audit-corpus.sh` and
`eval/fetch-testcases.sh`), before and after:

| Files | Write back the same | Facets editable, before | after |
| --- | --- | ---: | ---: |
| 64 public IDS | 64 / 64 | 1,738 (86.4%) | 1,738 (86.4%) |
| 12 IDS-Audit-tool ValidFiles | 12 / 12 | 214 (26.5%) | **227 (28.1%)** |
| 187 buildingSMART pass cases | 187 / 187 | 319 (85.3%) | 319 (85.3%) |

The 29 temporal enumerations in the IDS-Audit-tool files: 13 open as rows
(the 13 in specifications with a class), 16 stay kept: their
specifications' applicability is an attribute with no class
(`RichFileAttribute_Ifc4.ids`, `_Ifc4x3.ids`), and the page has no rows
there for any facet. No public IDS and no buildingSMART test case lists dates.

## The page

`node eval/date-oneof-page.mjs` (Playwright, Chromium, 390 px wide) opens an
IDS whose door warranty start date is one of two dates on `xs:string`: the
row opens editable with both dates ticked and the note "This file writes the
list on xs:string; IDS 1.0's DataTypes table gives this type xs:date. ...";
**Write on xs:date** turns it into "Written on xs:date, the base IDS 1.0 gives
this type."; the downloaded IDS lists the same dates on `xs:date` and passes
the sample house with a warranty, as the opened file did. No horizontal
scroll, no page errors.

Tests: `editor.test.mjs` ("a one-of on a date, date-time or duration ...":
bases for date, duration and an IFC4 `IfcWorkSchedule.CreationDate`
attribute, audit clean, verdicts equal on both bases, byte-for-byte reopen
on both, the base button, another base kept, text rows unchanged). Full
suite: `node --test *.test.mjs`, 168 of 168 pass.

## Not done

- Values compared as XSD values (P24M = P2Y) rather than text: it would part
  this checker from IfcTester on the same file, so not without a second
  implementation doing the same.
- A real IFC4 export holding dates is still missing (`model-date-range`).
- Attribute rows in a specification whose applicability has no class.
