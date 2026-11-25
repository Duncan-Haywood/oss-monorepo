# The IDS editor on 28 more real exports: one property, two data types (2026-11-24)

**Question.** The editor's model-driven offers (sets, values, ranges,
attribute and code lists) were measured on four or five exports
(`model-inventory-2026-11-16.md`, `model-values-2026-11-17.md`,
`model-attr-ranges-2026-11-17.md`). Do they hold on a wider set of real
models from other tools: ARCHICAD, Revit 2011-2022, Tekla, Allplan, IFC4X2/4X3
bridges and roads?

**Data.** The 28 `.ifc` files in `github.com/ThatOpen/engine_web-ifc`,
`tests/ifcfiles/public`, at commit `c4a65a31` (2026-11-23). Fetched with a
blob-less sparse clone (`git clone --filter=blob:none --no-checkout`, then
`git sparse-checkout set --no-cone '/tests/ifcfiles/public/*.ifc'`). They are
not committed here. They total 396 MB and 71,448 objects. Two of them,
AC20-FZK-Haus and ISSUE_005_haus, are the same file.

## Every sweep, before this change

| Script | Result on the 28 models |
| --- | --- |
| `eval/model-inventory.mjs` | 28 of 28 read, 0 failed (IFC2X3, IFC4, IFC4X2 read as IFC4, IFC4X3_RC2 and IFC4X3_ADD2 as IFC4X3); 533 standard (class, set) pairs, 103 Pset_/Qto_ sets on a class the standard does not give them, 2,964 project-own pairs; 48 of 1,097 standard properties in a type the template does not give |
| `eval/model-attr-ranges.mjs` | numeric attributes 151 of 151 ranges pass their model; booleans 42 of 42 |
| `eval/model-attr-codes.mjs` | attribute one-of lists 1,704 of 1,704 pass; 5 of 5 fail on exactly the empty objects the row warns about; classification codes 31 of 31 pass, 26 of 26 fail on exactly the warned objects |
| `eval/model-values.mjs` | property offers **19,296 of 19,300** pass |

All 48 standard-type mismatches come from three Revit 2011-era exports:
Office_A, dental_clinic and duplex. They write every `Pset_*Common.Reference`
as IFCLABEL where the template gives IFCIDENTIFIER, stair NumberOfRiser and
NumberOfTreads as IFCINTEGER (template IFCCOUNTMEASURE), RailingCommon.Height
as IFCREAL, and CoveringCommon.Finish as IFCLABEL (template IFCTEXT). The
editor already handles these: it warns on the row and offers Accept any data
type (`untypeRow`, `model-any-type-2026-11-17.md`), and the sweep skips them.

## The four failures

All four are in ISSUE_068_ARK_NUS_skolebygg (a Norwegian school, Revit to
IFC2X3). Each is a project-own property that the export writes as IFCLABEL
on some objects and IFCTEXT on others:

| Class | Property | IFCLABEL | IFCTEXT |
| --- | --- | ---: | ---: |
| IFCSPACE | Constraints.Level | 162 | 145 |
| IFCSPACE | Other.Area Type | 15 | 10 |
| IFCFLOWTERMINAL | Other(Type).Category | 168 | 20 |
| IFCVALVETYPE | Other.Category | 5 | 3 |

The inventory kept both types in rank order. But the own-set row took
`dataType` from the first one, and `modelSets` (which merges the classes of a
specification) took the first type it saw, not the commonest. A one-of built
from the model's values therefore asked `dataType="IFCLABEL"`, and IDS
compares the dataType exactly, so every object written as IFCTEXT failed.
That is 178 objects on four checks that the page presented as matching the
model. The ARCHICAD, Tekla and other exports write one type per property.
Office_A also writes three Revit type properties ("ADA Compliant" and two
Green Building flags) as IFCBOOLEAN on 10 objects and IFCLABEL on 8. No value
was offered for those, but a typed check fails them the same way.

## What changed

- `inventory.mjs` gives each property `typeCounts`, `[[type, n], ...]`
  commonest first.
- `editor.mjs` `modelSets` sums the type counts across classes. Its
  `dataType` is now the commonest type, not the first seen. So the type the
  page fills in for an own property is the one most objects hold.
- `mixedModelTypes(q)` returns those counts when the model writes more than
  one type. `untypeOwnRow(S, r, q)` writes the own-set row with no dataType.
  It keeps the value when every type is text (IFCLABEL, IFCTEXT,
  IFCIDENTIFIER: the same string to every checker). With a boolean or a
  number among the types it keeps presence only, because checkers read an
  untyped boolean or real differently (`model-any-type-2026-11-17.md`).
- `editor.html`: the own-set row now says "written as IFCLABEL on 162,
  IFCTEXT on 145. A check with dataType IFCLABEL fails the 145 written as
  IFCTEXT." It also has an **Accept any data type** button (usage event
  `editor_untyped_own`).
- Fixed a page note that predates this change: an own-set row whose property
  the model does have also said "None of the model's ... objects has it".
  The `else` lacked a test that the model had the property.
- `eval/model-values.mjs` applies the button to mixed rows (as an author
  would) and counts them. `--typed` reproduces the old behaviour. The script
  now also takes single files.

## Result

`node eval/model-values.mjs DIR` on the 28 models:

| | before (`--typed`) | after |
| --- | ---: | ---: |
| own properties written in several types, with an offer | 4 | 4 (no dataType, value kept) |
| requirements built from offers that pass their own model | 19,296 of 19,300 | **19,300 of 19,300** |

IfcOpenShell's IfcTester 0.9.0 (with ifcopenshell 0.9.0.post1) agrees, run
through `eval/crosscheck_ifctester.py` on ARK_NUS with an IDS holding each of
the four rows typed and untyped. All 8 specs match element for element:

| Row | Typed: IfcTester / ours | No dataType: IfcTester / ours |
| --- | --- | --- |
| IFCSPACE Constraints.Level | fail 145 / fail 145 | pass / pass |
| IFCSPACE Other.Area Type | fail 10 / fail 10 | pass / pass |
| IFCFLOWTERMINAL Other(Type).Category | fail 20 / fail 20 | pass / pass |
| IFCVALVETYPE Other.Category | fail 3 / fail 3 | pass / pass |

The page was driven in Chromium (Playwright) with a sample house in which
two walls write `Acme_Wall.Zone` as IFCLABEL and one as IFCTEXT. The row
showed the counts and the button, and the button wrote the property with no
dataType and the one-of kept. Tests: `inventory.test.mjs` (the house, typed
fails 1 wall, untyped passes; the boolean case keeps presence only). The
venture's 535 tests pass.

## Left

- Standard-set rows that a model writes in two types: none among the 28
  models (the template's type governs those rows, and `untypeRow` covers a
  single other type).
- A property one class writes as IFCLABEL and another as IFCTEXT in one
  multi-class specification: summed now, but no public model shows it.
- Why Revit splits LABEL and TEXT within one property: probably text length
  or the parameter's storage type in the exporter. Not checked against the
  exporter source.
