# The IFC schema's own WHERE rules, run beside ifcopenshell.validate (2026-11-24)

**Question.** `eval/inverse-counts-2026-11-24.md` closed the last kind of
`ifcopenshell.validate` line the conformance pass did not check, except one:
the schema's WHERE rules (`express_rules=True`). IFC4 has 677 of them, IFC4X3
777 and IFC2X3 363, and several decide what an IDS check reads. For example,
`IfcWall.CorrectPredefinedType` says a wall whose PredefinedType is
USERDEFINED must name itself in ObjectType, which is where an IDS
predefinedType facet then looks. `IfcWall.CorrectTypeAssigned` says a wall's
type must be an IfcWallType, so the properties it inherits are a wall type's.
`IfcObject.UniquePropertySetNames` says one object has no two property sets of
the same name. Can this checker run them all, and does it agree with
IfcOpenShell?

**Answer.** Yes. `where-rules.mjs` is an interpreter for the part of EXPRESS
(ISO 10303-11) the IFC schemas use. It runs every WHERE rule, every DERIVE
attribute the rules read, all 38-48 functions per schema and both global RULEs,
taken from the buildingSMART `.exp` files. Nothing is coded by hand per rule.
On the 492 public files it agrees with ifcopenshell.validate 0.9.0 on
**26,013 rule failures, record for record**. The disagreements, 21 one way
and 18 the other, are each traced below to a known cause.

| Set | Files | Found by both | Only here | Only IfcOpenShell |
| --- | ---: | ---: | ---: | ---: |
| IfcOpenShell `16f9a41` | 293 | 1,023 | 21 | 8 |
| ThatOpen engine_web-ifc `024cd31` | 110 (106 IfcOpenShell checks) | 24,988 | 0 | 10 |
| buildingSMART IFC4.3.x-sample-models `ef22440` | 46 | 0 | 0 | 0 |
| buildingSMART Sample-Test-Files `5030f65` | 35 | 0 | 0 | 0 |
| opensourceBIM IFC-files `cb96c50` | 8 | 2 | 0 | 0 |

It is fast enough to run on every check. The 492 files (about 690 MB) take
about 70 s in all, and 9.9 million rule evaluations. On AC20-FZK-Haus.ifc
(2.5 MB, 40,455 evaluations) it takes 0.31 s, and IfcOpenShell's rule runner
takes 4.0 s for the same 165 failures. So the rules now run inside
`conformance.mjs`: on the CLI (`--conformance`, `--no-rules` to skip) and in
the MODEL block of every check of a STEP file up to 40 MB, on the page and in
the CLI report.

## How

`schema/gen-rules.mjs` pulls each schema's executable parts into
`schema/rules-ifc2x3.json`, `rules-ifc4.json` and `rules-ifc4x3.json` (80, 154
and 177 kB, loaded only when the rules run). Those parts are the WHERE rules of
entities and defined types, DERIVE expressions, functions and global RULEs, as
EXPRESS text. It also lists which inverses hold one record rather than a set,
which matters for IFC2X3's `IfcGroup.IsGroupedBy`. The rule counts are 363, 677
and 777, the same as IfcOpenShell's. The test suite checks this, and that
every rule, derive and function parses.

`where-rules.mjs` parses that text once per schema and evaluates it on the
records `step.mjs` reads:

- **Expressions** follow EXPRESS precedence, which is not C's: AND binds like
  `*` and OR like `+`, below every comparison. They cover attribute access
  through `SELF\Supertype.Attr`, indexing and slices, aggregate initialisers
  with repetition (`[0.0 : n]`), `QUERY`, intervals (`{1 <= x <= 12}`),
  `IN`, `||` for strings and for complex entity values, `:=:` and the
  built-ins (`SIZEOF`, `TYPEOF`, `USEDIN`, `NVL`, `HIINDEX`, `ROLESOF`,
  `VALUE_UNIQUE`, ...).
- **Three-valued logic.** `?` and UNKNOWN propagate as ISO 10303-11 says, and
  a rule fails only when it comes out FALSE.
- **Statements** for function bodies: LOCAL, IF, CASE, REPEAT with a counter,
  WHILE and UNTIL, ESCAPE, RETURN, and assignment into aggregates and into
  attributes of entity values a function builds. `IfcNormalise` writes into a
  copy, never into the file's record, and a test pins that.
- **Values carry their declared type.** A bare `2.5` in an IfcPositiveLengthMeasure
  slot answers `TYPEOF` as that measure and as IfcLengthMeasure. Derived
  attributes (written `*`, or declared in DERIVE) are computed, so
  `IfcSIUnit.Dimensions` comes from `IfcDimensionsForSiUnit`. Inverses are
  read from an index built once per attribute.
- **Defined types' rules** run on every value written in that type, inside
  selects and lists too. One example is IFC2X3's IfcCompoundPlaneAngleMeasure on a
  site's latitude.

Five details came from first runs that did not match:

1. **SET locals.** `IfcUniquePropertyName` adds each name to a
   `SET OF IfcIdentifier` and compares its size with the property count. A set
   keeps its members distinct, and a first version added duplicates and missed
   both of IfcOpenShell's duplicate-name fixtures.
2. **ARRAY index bounds.** `IfcSurfaceWeightsPositive` reads a B-spline
   surface's weights as `ARRAY [0:UUpper]`. Indices start at the declared lower
   bound, not 1, and a LOCAL declared `ARRAY [lo:hi]` now keeps `lo`.
3. **Writes into attributes.** `IfcBaseAxis` and `IfcVectorSum` assign
   `U[1].DirectionRatios[1] := ...`. 4,154 evaluations stopped on that until
   attribute targets were writable.
4. **A record's values are converted once.** `IfcPixelTexture.PixelAsByteAndSameLength`
   reads `Pixel[1]` once per pixel. On the IFC 4.3 sample with a 256 x 256
   texture, that made 65,536 re-reads of a 65,536-item list, 20 s, until
   converted values were cached per record (0.2 s).
5. **Instance equality by value.** `IfcEdgeLoop.IsClosed` asks
   `EdgeList[1].EdgeStart :=: EdgeList[Ne].EdgeEnd`. web-ifc's ISSUE_171 closes
   20 loops with a second vertex record at the first vertex's point.
   IfcOpenShell compares instances by value while it runs rules, and so does
   this now, because the loops are closed in space.

## The disagreements

**Only here (21, all in one file).** IfcOpenShell's `beam-standard-case.ifc`
declares IFC4X3 but writes `IFCBEAMSTANDARDCASE`, an IFC4 class. 18 material
associations and 2 beam types point at those records, so
`IfcRelAssociatesMaterial.AllowedElements` and
`IfcTypeProduct.ApplicableOccurrence` see things that are not elements or
products in IFC4X3. That is true of the file, and the conformance pass
already names the outside class.

**Only IfcOpenShell (18).** None of these is a fault in the file:

- **10 B-spline weights** (FM_ARC_DigitalHub): every weight is 1.0. The
  IfcOpenShell line's text is a Python `TypeError` ("unsupported operand
  type(s) for -: 'list' and 'int'") inside its own runner, logged as a
  violation. That is the ARRAY lower-bound case above.
- **5 `North2D`** on representation subcontexts: IfcOpenShell cannot compute
  the derived `TrueNorth` and logs "Attribute not set". Here it is derived from
  the parent context, which has none, so the rule holds.
- **2 `IfcRepresentationContextSameWCS`** (annotation.ifc, bug_2517_test2.ifc):
  a 2D placement whose RefDirection is 3D makes `IfcOrthogonalComplement`
  return `?`, so the comparison is UNKNOWN, which passes. IfcOpenShell reads
  the indeterminate as true. The file's real fault, a 3D direction in a 2D
  placement, is flagged by both as `IfcAxis2Placement2D.RefDirIs2D`.
- **1 `IfcPositiveLengthMeasure.WR1`** on a string written where a length
  belongs: here the ordering is not evaluated, and the conformance pass
  already reports the wrong literal.

One rule is read as IfcOpenShell reads it rather than as written:
`IfcBoxAlignment` compares case-blind, because IfcOpenShell's labelled fixture
`pass-3-box-alignment-CENTER-uppercase` expects `'CENTER'` to pass. Other
string comparisons stay case-sensitive. A first try made all of them
case-blind and invented duplicate quantity names out of ARCHICAD's
`Breite links` and `Breite Links`.

## What the public files hold

118 of the 492 files break at least one rule, 87 rules in all:

| Rule | Failures | Where | What it means |
| --- | ---: | --- | --- |
| `IfcAdvancedFace.ApplicableEdgeCurves` | 17,181 | FM_ARC_DigitalHub (10,055), ISSUE_159 (7,126) | Advanced faces bounded by trimmed curves, which IFC4 does not allow there. A strict kernel may reject the face |
| `IfcQuantityLength.WR22` (+ Area 62, Volume 39) | 4,068 | schependomlaan (3,829), C20-Institute (184) | Negative quantities: an IDS value range or a takeoff reads a length below zero |
| `IfcShapeModel.WR11` | 1,732 | C20-Institute (1,217), AC20-FZK-Haus (280) | Shape representations no product, map or aspect uses |
| `IfcPropertySet.WR32` | 1,357 | ISSUE_102 M3D-CON-CD (1,261) | Two properties of one name in a set: an IDS property facet may read either |
| `IfcExternalReference.WR1` | 391 | IfcOpenShell's Pset_IFC4_ADD2.ifc | References with no identification, location or name |
| `IfcProduct.PlacementForShapeRepresentation` | 374 | Sverchok facades (353) | Shape geometry with no placement |
| `IfcRelSpaceBoundary.CorrectPhysOrVirt` | 207 | FM_ARC_DigitalHub (184) | Physical boundaries with no building element |
| `Ifc*.CorrectTypeAssigned` | 81 | ifcbridge-model01 (IFC4X2, read as IFC4) | Plates, beams, footings and walls typed by an IfcBuildingElementProxyType |
| `Ifc*Type.CorrectPredefinedType` | 3 | web-ifc's ISSUE_171 | USERDEFINED types with no ElementType |

The rules an IDS check leans on hardest fire least: 3 `CorrectPredefinedType`
failures and one `UniquePropertySetNames` in 492 files. Exporters mostly get
those right. That is why it is worth knowing when one does not: on such an
object, an IDS facet's answer depends on the tool.

## Reproduce

```
curl -sL -o IFC4.exp https://raw.githubusercontent.com/ThatOpen/engine_web-ifc/main/src/schema-generator/IFC4.exp
node schema/gen-rules.mjs IFC4.exp > schema/rules-ifc4.json      # and IFC2X3, IFC4X3
sh eval/fetch-ifcopenshell-samples.sh
node --stack-size=8000 eval/where-rules-sweep.mjs eval/ifcopenshell /tmp/ours.json      # 2.5 s
python -m venv v && v/bin/pip install ifcopenshell pytest                              # 0.9.0.post1
v/bin/python eval/conformance_ifcopenshell.py --rules eval/ifcopenshell > /tmp/ios.jsonl
python3 eval/where_rules_compare.py /tmp/ours.json /tmp/ios.jsonl
```

The other sets are the sparse clones named in `eval/conformance-2026-11-24.md`.
IfcOpenShell's rule run on web-ifc's files is the slow step: run it in the
background.

## Left

The `LIKE` operator evaluates to UNKNOWN; no IFC rule uses it. A one-file
`IfcBoxAlignment` exception follows IfcOpenShell. Seeded faults, one per rule
family, written into the public files to show each rule fires when it
should, are the next measurement (NEXT.md).
