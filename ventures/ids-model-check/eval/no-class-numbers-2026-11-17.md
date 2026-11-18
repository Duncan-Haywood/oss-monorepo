# Numbers on attributes in specifications with no class, 2026-11-17

The question: `eval/number-oneof-2026-11-17.md` left 20 of the 129 numeric
one-of lists in buildingSMART's IDS-Audit-tool valid files held as written
("attributes of non-element classes ... in specifications with no class whose
attribute the no-class rows do not type"). Why each one was held, and which
of them the editor should open as an editable row.

## What the 20 were

All 20 are in the `RichFileAttribute_Ifc2x3/Ifc4/Ifc4x3.ids` files, where the
applicability is the attribute alone, with no class. Looking each attribute
up in the three schemas (every class that declares it, its type, whether it
is stored, derived or a list) splits them three ways:

| why held | attributes | lists | ranges |
| --- | --- | ---: | ---: |
| Stored as a number on one class, **derived** (`*`) on a subclass: IfcGeometricRepresentationSubContext redeclares both | CoordinateSpaceDimension, Precision | 5 | 3 |
| **IfcCountMeasure**, a `NUMBER` in IFC2X3 and IFC4, so the page wrote `xs:double`; the file writes `xs:integer` | BarCount (IFC2X3), CountValue (IFC4) | 3 | 1 |
| A **list** on every class that has it (IfcLightDistributionData, IfcRelConnectsPathElements, IfcIndexedColourMap, IfcTextureVertexList, IfcRecurrencePattern) | LuminousIntensity, RelatingPriorities, ColourIndex, TexCoordsList, DayComponent, WeekdayComponent, MonthComponent | 12 | 16 |

The first two kinds are real numbers a checker compares. The third is not:
buildingSMART's test case `invalid-value_checks_always_fail_for_lists` says a
value check on a list attribute always fails, and the audit already reports
it as an error (`value-list`) when a class is named.

## What changed

- **Derived on a subclass, same type:** the no-class typing no longer treats
  the subclass's derived redeclaration as a different kind of attribute. The
  row is a number (`xs:integer` for CoordinateSpaceDimension, `xs:double`
  for Precision) and says which class derives it: its objects never hold a
  value, so they fail the attribute as a requirement and are left out by it
  as applicability.
- **xs:integer on a NUMBER:** a number row opened from a file that restricts a
  `NUMBER`-typed attribute on `xs:integer` keeps that base (`numBase`) and asks
  for whole numbers. The checker reads each value against the attribute's own
  type, so `27` asks the same on either base. A new row still writes the
  type's own `xs:double`; changing the attribute or kind drops the kept base.
- **Lists stay held, with an audit warning:** with no class named, the audit
  now warns (not errors, since IDS-Audit-tool accepts these files) when the
  attribute is a list, object, select or binary on every class that stores it:
  "TexCoordsList is a list on every class that has it (IfcTextureVertexList);
  IDS cannot compare it with a value; every object this checks fails it", or,
  on an applicability facet, "this applicability selects nothing".

## Measured

`node eval/no-class-numbers.mjs` (corpus from `eval/fetch-audit-corpus.sh`),
full table in `eval/no-class-numbers.txt`. Over every numeric attribute facet
in the three RichFileAttribute files:

```
numeric lists: 114 open as rows, 12 kept; ranges: 120 rows, 16 kept
  28  kept: a list attribute
  8  row: derived on IFCGEOMETRICREPRESENTATIONSUBCONTEXT
  4  row: on xs:integer, as written
  222  row: typed
```

All 28 that are still held carry the new audit warning; none of the 234 rows does.

`node eval/editor-open.mjs`, before and after:

| Files | Write back the same | Facets editable, before | after |
| --- | --- | ---: | ---: |
| 64 public IDS | 64 / 64 | 1,829 (90.9%) | 1,829 (90.9%) |
| 12 IDS-Audit-tool ValidFiles | 12 / 12 | 721 (89.2%) | **733 (90.7%)** |
| 187 buildingSMART pass cases | 187 / 187 | 320 (85.6%) | 320 (85.6%) |

So 117 of the 129 numeric lists in the valid files now open as rows (was 109).
The other 12 are the list attributes above, held as written on purpose.
Audit errors are unchanged on every file (`eval/editor-open.mjs` "audit
errors changed on 0"; `eval/audit-corpus.mjs` output identical before and
after; `eval/run-testcases.mjs` 334 of 334, and every valid IDS still reads
as valid).

**On a real model.** The same script writes three no-class specifications
from the page's own rows and checks them on buildingSMART's IFC 4.3
`samples/bsi-ifc43/Building-Hvac.ifc`:

```
restriction bases written: xs:integer, xs:double, xs:integer
Contexts are 3D: pass, 1 applicable, 1 pass, 0 fail
Context precision at most 1 mm: pass, 1 applicable, 1 pass, 0 fail
Every context with a type is 3D: fail, 2 applicable, 1 pass, 1 fail
  fail: #12 IFCGEOMETRICREPRESENTATIONSUBCONTEXT ... CoordinateSpaceDimension ...
audit of the written file: clean
```

The first two take CoordinateSpaceDimension and Precision as their own
applicability, so the subcontext (`*`) is left out. The third applies to
anything with a ContextType, so the subcontext is selected and fails. That
is the case the row's note describes.

**The page.** `node eval/no-class-numbers-page.mjs` (Playwright, Chromium,
390 px wide) opens an IDS with CoordinateSpaceDimension one of 3 and
CountValue one of 32, both on `xs:integer` and with no class. Both open as
ticked rows with 0 held facets, and each shows its note (derived on
IfcGeometricRepresentationSubContext; written on xs:integer). The
downloaded IDS keeps `xs:integer` on both. Typing `2.5` into CountValue gives
"2.5 is not an integer". No horizontal scroll, no page errors.

Tests: `editor.test.mjs`, "with no class, a number attribute derived on a
subclass ..." and "with no class, a value on an attribute that is a list on
every class is an audit warning ...". Full suite `node --test *.test.mjs`:
185 pass, 0 fail, 1 skipped.

## Not done

- No public IDS outside IDS-Audit-tool's synthetic files writes a no-class
  number check, so these files are the only corpus for this work. A real
  file would show whether authors write such checks at all.
- IfcTester was not run on these specifications.
