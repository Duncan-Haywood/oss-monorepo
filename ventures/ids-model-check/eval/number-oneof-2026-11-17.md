# IDS editor: "one of" rows on numbers (2026-11-17)

**Question.** The editor offered "one of" on text and on standard
enumerations, but not on numbers: a door height of 2100 or 2400, a cardinal
point 1 to 9, a stair with 12 or 14 risers. An opened IDS that listed numbers
(buildingSMART's IDS-Audit-tool valid files do, 129 times, on `xs:double` and
`xs:integer`) was held as read-only XML. Can a number row offer a one-of that
writes back unchanged, and do this checker and IfcOpenShell's IfcTester read
it the same way?

## What landed

- `editor.mjs`: `valueChoices` offers **one of** on number rows (properties,
  own-set properties, attributes) and says whether the row is an integer
  (`integer`). The list is written on the row's base, `xs:double` or
  `xs:integer`, as a range is.
- `numberValueProblem`: a listed value must be a number IDS can read (`42.3`,
  `1e-3`; not `2,4`, `5 mm` or `NaN`), and on an integer row digits only
  (`3.0` is refused with "write 3"). The audit's own literal rules.
- Opening a file: a numeric enumeration opens as a row when every value
  passes that test and the row writes back the same XML; otherwise it stays
  kept as written. `typeRow` keeps a number list when a row with no dataType
  is given one.
- `modelValueOffer`: with a model open, a number row whose model holds at most
  `NUMBER_ONEOF_MAX` (12) different values gets **Allow exactly these
  values** beside **Use the model's range**.
- `inventory.mjs`: each tally now keeps the exact numbers the model holds
  (`exact`, `String(num)`, up to `MAX_EXACT` = 64) beside the 12-digit tally
  it shows. The offer lists the exact values, not the 12-digit ones (next
  section).
- `editor.html`: the mode, the tick list (the model's tally counts matched at
  12 digits), a warning naming each value IDS cannot read, and a note on how
  the checkers compare (below).

## The trap: IfcTester compares a listed number exactly

IfcTester 0.9.0's `Restriction.__eq__` (`ifctester/facet.py`) tests an
enumeration with `other not in [cast_to_value(v, other) for v in value]`:
Python equality on floats, no tolerance. This checker compares each listed
real with IDS's tolerance (`|a - b| <= |b| x 1e-6 + 1e-6`), as it does a
simple value. The first build offered the model's values at the 12
significant digits the inventory tallies them at; IfcTester then failed 20 of
the Schultz Residence's 25 windows on a list of their own ten heights
(OverallHeight, in feet as Revit wrote them, each listed at 12 digits), while
this checker passed all 25. So the offer now names every exact value: a door at 2.4 and one at
2.4000000000000004 make one tally line and two list entries.

## Measured

`node eval/number-oneof.mjs --ids-out OUT samples/tiny-house.ifc DIR` on the
sample house and the four real exports of `model-values-2026-11-17.md`
(opensourceBIM/IFC-files at `cb96c50`: HHS Office MEP, architect and
construction, OpeningDesign.com Schultz Residence; not committed). Every
number property or attribute row whose model holds at most 12 values gets
three requirements, "if present, must be one of": the values **as written**
(the button), the same values **to 6 digits** (what an author copying from a
viewer types), and the list **without its commonest value**. Full output:
`eval/number-oneof.txt`.

| Model | Number rows | One-of offered | As written: pass | To 6 digits: as predicted | Without the commonest: as predicted | Reopened |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| MEP.ifc | 451 | 376 | 376 of 376 | 234 of 234 | 168 of 168 | 778 rows, identical |
| architect.ifc | 157 | 122 | 122 of 122 | 30 of 30 | 42 of 42 | 194 rows, identical |
| construction.ifc | 132 | 126 | 126 of 126 | 42 of 42 | 51 of 51 | 219 rows, identical |
| Schultz_Residence.ifc | 34 | 33 | 33 of 33 | 18 of 18 | 25 of 25 | 76 rows, identical |
| tiny-house.ifc | 6 | 6 | 6 of 6 | 0 of 0 | 0 of 0 | 6 rows, identical |
| **Total** | **780** | **663** (109 integer, 554 real) | **663 of 663** | **324 of 324** | **286 of 286** | **1,273 rows, 0 kept** |

- 81 more rows hold a full list of more than 12 values: those keep only the
  range.
- "As predicted" for the last column counts the objects holding a value no
  remaining one is within tolerance of: Revit writes 9.9999989437 next to 10
  and 2.80000000012 next to 2.8, so dropping 10 or 2.8 fails no object in this
  checker. Values that differ only past the 12th digit share a tally line, so
  "without" drops all of them.
- Every IDS audits clean (`node cli.mjs --audit`), and reopens with every row
  editable, written back byte for byte.

### Against IfcTester

`python3 eval/crosscheck_ifctester.py OUT/<model>.ids <model>` with
ifcopenshell 0.9.0.post1 and ifctester 0.9.0, same verdict and same failing
elements. Tally and every differing "as written" row:
`eval/number-oneof-ifctester.txt`.

| Requirement | Attributes: same | Properties: same |
| --- | ---: | ---: |
| As written (the editor's offer) | **27 of 27** | **619 of 636** |
| To 6 digits (as a person types them) | 0 of 9 | 22 of 315 |
| Without the commonest value | DROP_ATTR | DROP_PROP |

- **The offer agrees on 646 of 663.** All 17 that differ are property values
  this checker converts to SI from feet, square feet or degrees (Revit's
  `PSet_Revit_Dimensions.Area`, `BaseQuantities.CrossSectionArea`,
  `Pset_SlabCommon.PitchAngle`, MEP fitting angles): ifcopenshell converts with
  its own table of unit names (`ifcopenshell.util.unit.convert`), this checker
  with the file's `IfcConversionBasedUnit` factor, and the two land a last
  digit apart. Attributes are not converted and agree on every row. The row
  says so and points to a range.
- **Values typed to 6 digits agree on 22 of 324.** This checker passes a
  value within a millionth; IfcTester fails it. That is the case the row's
  note warns about: a list typed from a viewer's display is a different check
  in the two tools. A range (rounded outward, `model-values-2026-11-17.md`)
  reads the same in both.

## Opened files

`node eval/editor-open.mjs` (corpora from `eval/fetch-audit-corpus.sh` and
`eval/fetch-testcases.sh`), before and after:

| Files | Write back the same | Facets editable, before | after |
| --- | --- | ---: | ---: |
| 64 public IDS | 64 / 64 | 1,795 (89.2%) | 1,795 (89.2%) |
| 12 IDS-Audit-tool ValidFiles | 12 / 12 | 613 (75.9%) | **721 (89.2%)** |
| 187 buildingSMART pass cases | 187 / 187 | 319 (85.3%) | **320 (85.6%)** |

Of the 129 numeric lists in the IDS-Audit-tool valid files, 109 open as rows.
The 20 still kept are attributes of non-element classes (BarCount,
CoordinateSpaceDimension, DayComponent, LuminousIntensity, TexCoordsList...)
in specifications with no class whose attribute the no-class rows do not
type. No public IDS lists numbers.

## The page

`node eval/number-oneof-page.mjs` (Playwright, Chromium, 390 px wide) opens an
IDS whose door OverallHeight is one of 2100 or 2400 on `xs:double`: the row
opens editable, both ticked, with the note on tolerance. It then opens a
model with doors 2100, 2400 and 2100.0000000000005 high: the model line reads
"2 different values: 2100 (2), 2400 (1)" and offers both buttons; **Allow
exactly these values** ticks 2100, 2100.0000000000005 and 2400, and the
downloaded IDS lists those three and passes the model. Typing `2,4` adds a
warning, "2,4 is not a number IDS can read ...". No horizontal scroll, no
page errors.

Tests: `editor.test.mjs` ("a one-of on numbers ..."), `inventory.test.mjs`
("the inventory keeps each number exactly as held ..."). Full suite:
`node --test *.test.mjs`, 178 pass, 0 fail.

## Not done

- Matching ifcopenshell's unit conversion digit for digit: it would mean
  copying another implementation's table rather than the file's own factor,
  so the row points to a range instead.
- The 20 numeric lists on non-element attributes in no-class specifications.
- A list longer than 12 values from the model (81 rows): a range covers them.
