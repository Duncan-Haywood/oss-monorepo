# Seeded faults for the WHERE rules, and the IDS rows that name them (2026-11-24)

**Question.** `eval/where-rules-2026-11-24.md` matched `where-rules.mjs`
with `ifcopenshell.validate` on 26,013 rule failures in 492 public files. Those
files only exercise the rules their exporters break: 87 of about 1,800. The
rules an IDS check leans on hardest barely show up: 3 `CorrectPredefinedType`
failures and one `UniquePropertySetNames`. Does each of those rules fire when
the fault is really there, on the right record and nowhere else?

**Answer.** Yes. `eval/where-rules-seeded.mjs` writes eight fault families into
real files, one family per copy, and compares the rule failures with the
original's. On 24 public files that came to **358 seeds. Each one fired on the
record it was written into, under the rule it was aimed at. No other failure
appeared and none of the original's went away.**
`ifcopenshell.validate` 0.9.0.post1 (`express_rules=True`) gives the same
answer on every seeded copy it can open: 332 of 332 seeds, and the same new
failures as here on all 109 copies. The other 26 seeds are in the two files
whose draft schemas IfcOpenShell refuses (IFC4X2 and IFC4X3_RC2; this reads
them as IFC4 and IFC4X3).

## The families

| Family | What the seed writes | Rule it should break | Files | Seeds | Fired here | IfcOpenShell (files it opens) |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `userdefined-unnamed` | PredefinedType `.USERDEFINED.` with ObjectType (occurrence) or ElementType (type) set to `$`, first record of every class with the rule | `<Class>.CorrectPredefinedType` | 13 | 160 | 160 | 147 of 147 |
| `type-of-another-class` | the element typed by a new `IfcBuildingElementProxyType` (a proxy by an `IfcWallType`), moved out of its old type relationship if that keeps a member | `<Class>.CorrectTypeAssigned` | 11 | 49 | 49 | 45 of 45 |
| `duplicate-pset-name` | a second property set with an existing set's name on the same object, up to 3 classes | `IfcObject.UniquePropertySetNames` | 12 | 28 | 28 | 23 of 23 |
| `duplicate-property-name` | one property copied (new record) into its own set | `IfcPropertySet.UniquePropertyNames` (IFC2X3 `WR32`) | 24 | 24 | 24 | 22 of 22 |
| `negative-quantity` | a length, area, volume, weight, count or time quantity below zero, one per class | `IfcQuantity*.WR2x` (`Value >= 0`) | 14 | 41 | 41 | 41 of 41 |
| `negative-positive-length` | a door's and a window's OverallHeight below zero | `IfcPositiveLengthMeasure.WR1` | 13 | 24 | 24 | 24 of 24 |
| `3d-refdirection-in-2d` | a new 3D `IfcDirection` as a 2D placement's RefDirection | `IfcAxis2Placement2D.RefDirIs2D` (IFC2X3 `WR1`) | 16 | 16 | 16 | 15 of 15 |
| `3d-location-in-2d` | a new 3D point as a 2D placement's Location | `IfcAxis2Placement2D.LocationIs2D` (IFC2X3 `WR2`) | 16 | 16 | 16 | 15 of 15 |
| **all** | | | | **358** | **358** | **332 of 332** |

A file gets a family only when it has something to seed: 89 of the 192
file-family pairs had none (no type objects, no quantities, no 2D placement).

Three rules keep the seeds honest:

- **No seed lands on a record that already breaks its rule.** The first run
  seeded 4 records whose rule had already failed in the original: ISSUE_171's
  three USERDEFINED types and one of ISSUE_102's property sets. Those
  counted as seeded but added nothing. Now the seed takes the next record of
  the class.
- **No 2D placement that a representation context uses as its world
  coordinate system,** so `IfcRepresentationContextSameWCS` does not join in.
- **No 2D placement that positions a circle or ellipse.** On the first run, a
  3D point seeded into web-ifc's ISSUE_129 (Revit, IFC2X3) also broke
  `IfcCompositeCurve.WR42` and `IfcArbitraryClosedProfileDef.WR1`. That
  placement positioned a circle. A circle placed in 3D is a 3D curve, so the
  composite curve around it mixed dimensions and the profile built from it was
  no longer 2D. The rules were right; the seed tested three rules at once.

## The files

web-ifc `024cd31` `tests/ifcfiles/public`, every file under 16 MB (19: ARCHICAD,
Revit 2016-2021, Tekla 2020, BlenderBIM, IfcOpenShell, Solibri-optimised Revit
exports, the IFC4X2 bridge and the IFC4X3_RC2 road), and buildingSMART
Sample-Test-Files `5030f65` and IFC4.3.x-sample-models `ef22440` (5: the
SketchUp Building-Architecture scene in IFC2X3, IFC4 and IFC4X3, the
ReferenceView wall with opening and window, and the linear placement of a
signal). The originals are not committed (licences vary); the commands below
fetch them.

## Failing IDS rows now name the rule (`markModelRules`)

NEXT.md asked for the second half: an element that fails a specification and
also breaks one of the rules an IDS facet reads should say so in its row.
Until now the MODEL block and the specification rows were separate.
`conformance()` now ties four rules to elements (`elementRules`):

| Rule | Tied to | Note in the row |
| --- | --- | --- |
| `CorrectPredefinedType` | the element, and the occurrences of a type that breaks it | PredefinedType is USERDEFINED with no name for it, so a predefinedType facet's answer depends on the tool |
| `CorrectTypeAssigned` | the element | its type is another class's type, so the properties it inherits are not its own class's |
| `UniquePropertySetNames` | the element, and the occurrences of a type that breaks it | two property sets of one name, so a property facet may read either |
| `UniquePropertyNames` / IFC2X3 `WR32` | the objects a set defines, through `IfcRelDefinesByProperties` or the type's HasPropertySets | one property named twice in a set, so a property facet may read either value |

`markModelRules(report, conformance)` copies them into the failing rows as
`modelRules`. They show on the page (in the failure table), in the CLI text
report (`note:` lines under the element), in CSV (appended to the reasons) and
in the HTML report. The IDS verdict does not change.

On the 24 files plus ISSUE_102's CD export, 3,261 elements would carry a note:

| File | Elements | From |
| --- | ---: | --- |
| ISSUE_102_M3D-CON-CD (Tekla, IFC2X3) | 2,877 | 1,261 sets naming a property twice (`WR32`), 2,594 elements through them |
| ISSUE_102_M3D-CON | 227 | the same export, smaller |
| ifcbridge-model01 (IFC4X2 read as IFC4) | 81 | plates, beams, footings, walls, stairs, slabs, columns and accessories typed by proxy types |
| dental_clinic, Office_A (Revit via Solibri, IFC2X3) | 50, 21 | 6 sets naming a property twice |
| ISSUE_171 (BlenderBIM) | 3 | USERDEFINED wall, roof and footing types with no ElementType |
| FM_ARC_DigitalHub (IFC4) | 2 | roofs typed by another class's type |

`where-rules-seeded.test.mjs` pins the seed families on the bundled sample, and
pins one W-02 wall that fails the LoadBearing specification and carries all
three kinds of note.

## Reproduce

```
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/ThatOpen/engine_web-ifc.git webifc
(cd webifc && git sparse-checkout set --no-cone 'tests/ifcfiles/public/*.ifc' && git checkout)
# + Sample-Test-Files and IFC4.3.x-sample-models the same way ('*.ifc')
node --stack-size=8000 eval/where-rules-seeded.mjs /tmp/seeded FILES...           # 2 min 17 s for the 24
python -m venv v && v/bin/pip install ifcopenshell==0.9.0.post1 pytest
v/bin/python eval/where_rules_seeded_ifcopenshell.py /tmp/seeded/manifest.json --jobs 4   # the slow step: background it
```

## Next

Seeds for the global RULEs (`IfcRepresentationContextSameWCS`,
`IfcSingleProjectInstance`) and for families an IDS reads less directly
(material associations on non-elements, an `IfcSIUnit` with a wrong
dimension). The BCF and CI (JUnit, annotation) outputs do not carry the
`modelRules` notes yet.
