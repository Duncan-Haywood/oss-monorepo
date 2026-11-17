# IDS editor: property values with no dataType (2026-11-17)

**Question.** IDS 1.0 lets a property facet carry a value with no `dataType`
attribute. The editor always wrote the template's dataType on a standard
property, and an own-set row with no dataType took no value, so every such
facet in an opened file was held as read-only XML (39 in the public files'
applicability alone, `applicability-rows-2026-11-17.md`). Can the page hold
them as ordinary rows that write back what they read, and does the missing
dataType change what a check does?

**What landed:**

- `editor.mjs`: a property row has `untyped`. `importIds` (through
  `editableRow`) sets it when a facet has a value and no dataType; such a row
  is offered the text modes (exactly, one of, a pattern), writes no dataType
  and writes its value on `xs:string`, so a simple value or a string
  enumeration comes back as it was. A typed base (`xs:double` bounds with no
  dataType) still writes differently and stays kept as written.
- `typeRow(L, row, modelType)`: the row with the dataType the page would write,
  the template's for a standard property and, for an own set, the type the
  open model writes when the page offers it. The value carries over when it
  fits: `TRUE`/`True` on a boolean becomes `true`, a number stays an "exactly"
  number, an enumeration's members stay; anything else becomes "any value"
  and the page says so.
- The page: an untyped row says it has no dataType and why that matters, and
  offers **Write dataType IFCBOOLEAN** (or the template's type). An own-set
  row shows "none, as the file wrote it" in its type list. A condition row
  that is untyped gets a match count only when the model writes the property
  as text, because otherwise the checker compares it with the model's own type.
- `audit.mjs`: the existing `value-no-datatype` warning now adds, for a
  standard boolean written `TRUE`, `True`, `FALSE` or `False`, that this is not
  how IDS writes a boolean and that checkers disagree on it.

## Measured: opened files

`sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh && node eval/editor-open.mjs`,
on main's `editor.mjs` and on this one (main had moved to 1,682 since
`applicability-rows-2026-11-17.md`):

| Corpus | Facets editable before | After | Write back asking the same | Audit errors changed |
| --- | ---: | ---: | --- | --- |
| 64 public IDS files (`eval/real-ids-files.txt`) | 1,682 of 2,012 (83.6%) | 1,709 (84.9%) | 507 of 507 specifications | 0 files |
| 12 IDS-Audit-tool valid files | 174 (21.5%) | same | 288 of 288 | 0 |
| 187 buildingSMART pass cases | 316 (84.5%) | same | 187 of 187 | 0 |

The 27 new rows: 21 applicability conditions and 6 requirements, 16 in own
sets and 11 in standard ones, from six repositories (Rotterdam's permit
checks, OpenAEC's validator and its viewer's sample, an openingBIM CI sample,
bim-ootb's DXF-to-BIM standard and the CHEK Lisbon checker). 30 untyped facets stay kept: their specification has
no class the page can hold (no entity facet, or a pattern on it), so nothing
is offered for them. 9 more are empty typed restrictions
(`<xs:restriction base="xs:double"/>`), which ask for nothing a row can say.

## What the missing dataType does

Of the 11 standard-property rows, 4 are a boolean property written with a
capital: `Pset_WallCommon.LoadBearing` written `TRUE` in two published files
(OpenAEC-BIM-validator, open-3d-viewer) and `True` in a third (openingbim-cicd), and
`Pset_BuildingStoreyCommon.EntranceLevel = True` in Rotterdam's set.
buildingSMART's test cases write booleans only as lowercase `true`/`false`
with `dataType="IFCBOOLEAN"` (`property/fail-booleans_must_be_specified_as_lowercase_strings_1_3`),
so an untyped `TRUE` is a case the standard's tests do not settle.

The two checkers settle it differently. On `samples/tiny-house.ifc` (two
external walls, one internal), the applicability `Pset_WallCommon.IsExternal
= TRUE` with no dataType, then a FireRating requirement:

| | This checker | IfcTester 0.8.0 (ifcopenshell 0.8.5) |
| --- | --- | --- |
| untyped `TRUE` | 0 applicable, fail | 2 applicable, 1 failing |
| `dataType="IFCBOOLEAN"`, `true` (after **Write dataType**) | 2 applicable, 1 failing | 2 applicable, 1 failing |

(`python3 eval/crosscheck_ifctester.py SPEC.ids samples/tiny-house.ifc`, the two
files written by the page; the typed pair is also an assertion in
`editor.test.mjs`.) So the same published IDS checks a model's load-bearing
walls in one tool and nothing in another. The page now says so on the row and
the audit says so in its warning; typing the row makes both tools agree.

IfcTester 0.9.0.post1 (the version the earlier cross-checks used) was not
installable here (pip found no matching distribution), so this table uses
0.8.0; ifctester 0.8.0 failed with ifcopenshell 0.9.0.post1
(`'IfcWall' has no attribute 'wrapped_data'`) and ran with 0.8.5.

## Checked

- `editor.test.mjs`: an opened file with two untyped standard rows and an
  untyped own-set enumeration opens as three rows (none kept), writes back the
  same with no dataType, offers text modes only; `typeRow` gives
  `IFCBOOLEAN`/`true`, keeps a label's text, takes an own set's type from the
  model only when the page offers it, and drops a list on a number type; the
  typed file has no `value-no-datatype` warning for those rows.
- `inventory.test.mjs`: the own-set value with no dataType that used to be
  kept is now a row.
- `audit.test.mjs`: `LoadBearing = TRUE` with no dataType warns that checkers
  disagree; `true`, and a text property with `TRUE`, do not.
- In Chromium (Playwright, the shipped page, `samples/tiny-house.ifc`): the
  opened file reports 3 of 3 facets editable; the IsExternal row shows the
  warning and **Write dataType IFCBOOLEAN**; after the click the XML has
  `dataType="IFCBOOLEAN"` and `true`, and the condition reads "2 of the
  model's 3 object(s) of this class match"; no console errors.

Next: the same "write the dataType" offer for the 21 of 122 standard
properties real exports write in another type; exclusive bounds on an opened
range.
