# IDS editor: a range for numeric attributes (2026-11-17)

**Question.** Attribute rows offered the model's values as a one-of list
(`model-attr-codes-2026-11-17.md`), but every attribute was treated as text, so
a door's OverallHeight, a storey's Elevation or a stair's NumberOfRiser could
only be asked "exactly" one value, and a boolean such as IfcDoorStyle.Sizeable
was asked as a string. Can the editor ask a number between two bounds, built
from the model, written as IDS's own test cases write it (`xs:double` base),
and does the result pass the model it came from, in this checker and in
IfcOpenShell's IfcTester?

**What landed:**

- `editor.mjs` `attributeValueKind(S, classes, name)`: an attribute whose
  type is a real or integer (IfcPositiveLengthMeasure, IfcLengthMeasure,
  IfcInteger...) is a number row with a **between** mode; a boolean or logical
  is true/false; an enumeration keeps its values; everything else stays text.
  `valueChoices` uses it, so the page and an opened IDS agree.
- A restriction on a numeric attribute is written with the attribute's own
  base (`<xs:restriction base="xs:double">`, `xs:integer` for counts), as
  buildingSMART's `attribute/pass-strict_numeric_checking_may_be_done_with_a_bounds_restriction`
  test case does. Before, every attribute restriction was `xs:string`.
- An opened IDS with such a range now opens as an editable row and writes back
  the same XML; a range on an `xs:string` base is kept as written.
- With a model open, the row's **Use the model's range** button (already there
  for properties) fills the bounds, rounded outward (`outwardBound`).
- The range field's hint says attributes are compared **as the model writes
  them, in its own units**. Properties are converted to SI; attributes are not,
  in this checker or in IfcTester (below).

## Measured

`node eval/model-attr-ranges.mjs DIR samples/tiny-house.ifc` on the same four
exports from `opensourceBIM/IFC-files` at `cb96c50` as
`model-attr-codes-2026-11-17.md` (fetch steps there; not committed) and the
sample house. Every numeric (class, attribute) row is written "if present,
between the model's range"; a boolean row whose objects all hold one value is
written "if present, exactly that".

```
| Model | Schema | Numeric attribute rows | Range offered | Pass (no empty objects) | Fail on exactly the empty ones | Boolean rows | One value, offered | Pass |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS_Office_MEP.ifc | IFC2X3 | 2 | 2 | 2 of 2 | 0 of 0 | 0 | 0 | 0 of 0 |
| HHS_Office_architect.ifc | IFC2X3 | 4 | 4 | 4 of 4 | 0 of 0 | 2 | 2 | 2 of 2 |
| HHS_Office_construction.ifc | IFC2X3 | 6 | 6 | 6 of 6 | 0 of 0 | 0 | 0 | 0 of 0 |
| OpeningDesign.com_Schultz_Residence.ifc | IFC2X3 | 10 | 10 | 10 of 10 | 0 of 0 | 4 | 4 | 4 of 4 |
| tiny-house.ifc | IFC4 | 5 | 5 | 5 of 5 | 0 of 0 | 0 | 0 | 0 of 0 |

number: 27 rows, 27 offered; 0 rows with empty objects; built from offers: 27 of 27 pass, 0 of 0 fail on exactly the empty objects

bool: 6 rows, 6 offered; 0 rows with empty objects; built from offers: 6 of 6 pass, 0 of 0 fail on exactly the empty objects

Examples:
  HHS_Office_MEP.ifc IFCBUILDINGSTOREY.Elevation: 94.1717 to 10900 (4 objects; held 94.17173687834685 to 10899.99999999989)
  HHS_Office_MEP.ifc IFCSITE.RefElevation: 0 to 0 (1 objects)
  HHS_Office_architect.ifc IFCDOOR.OverallHeight: 1990 to 3020 (133 objects)
  HHS_Office_architect.ifc IFCDOOR.OverallWidth: 759.9999 to 2490 (133 objects; held 759.9999999999997 to 2489.999999726427)
  HHS_Office_architect.ifc IFCBUILDINGSTOREY.Elevation: 94.1717 to 10900 (4 objects; held 94.17173687834685 to 10899.99999999989)
  HHS_Office_architect.ifc IFCSITE.RefElevation: 0 to 0 (1 objects)
  HHS_Office_construction.ifc IFCSTAIRFLIGHT.NumberOfRiser: 9 to 11 (8 objects)
  HHS_Office_construction.ifc IFCSTAIRFLIGHT.NumberOfTreads: 9 to 10 (8 objects)
  HHS_Office_construction.ifc IFCSTAIRFLIGHT.RiserHeight: 0.574146 to 0.578964 (8 objects; held 0.5741469816272964 to 0.5789632957007791)
  HHS_Office_construction.ifc IFCSTAIRFLIGHT.TreadLength: 0.89598 to 0.940824 (8 objects; held 0.8959817522809572 to 0.94082318507823)
  HHS_Office_construction.ifc IFCBUILDINGSTOREY.Elevation: 94.1717 to 10900 (4 objects; held 94.17173687834685 to 10899.99999999989)
  HHS_Office_construction.ifc IFCSITE.RefElevation: 0 to 0 (1 objects)
  OpeningDesign.com_Schultz_Residence.ifc IFCWINDOW.OverallHeight: 1.583333 to 5.98959 (25 objects; held 1.58333333333332 to 5.98958333333333)
  OpeningDesign.com_Schultz_Residence.ifc IFCWINDOW.OverallWidth: 1.666666 to 5.25 (25 objects; held 1.66666666666667 to 5.25)
```

All 27 numeric and 6 boolean requirements pass their own model in this
checker. No numeric attribute row had empty objects, so the "fail on exactly
the empty ones" column has nothing to test here.

## The same requirements in IfcTester

`node eval/model-attr-ranges.mjs --ids-out OUT ...` writes one IDS per model;
`python3 eval/crosscheck_ifctester.py OUT/<model>.ids <model>` with
ifcopenshell/ifctester 0.9.0.post1 from PyPI: **33 of 33 specifications, same
verdict and same failing elements** (5 models).

## Units: as written, not SI

The ranges above are in each model's own length unit: HHS architect's doors
1990 to 3020 (millimetres), the Schultz Residence windows 1.583333 to 5.98959
and HHS construction's riser heights 0.574 to 0.579 (feet). IDS's
`UserManual/units.md` says measure values in an IDS are SI, and the property
facet's unit test cases convert; there is no attribute test case on units.
Both checkers compare attributes unconverted: a requirement "OverallHeight
between 2 and 2.2" (metres) on the sample house's 2100 mm door fails in this
checker and in IfcTester (checked once, same verdict). So an author who writes
an attribute range in metres for a millimetre or foot model fails every
object; the editor's hint says so, and the model's range is in the model's
units. Not changed in the checker: it would split from IfcTester, and the
standard does not settle it.

## Not done

- A numeric attribute row with empty or UNKNOWN objects on a real model (none
  of the five had one).
- Exclusive bounds (`minExclusive`): an opened IDS with one is still kept as
  written.
