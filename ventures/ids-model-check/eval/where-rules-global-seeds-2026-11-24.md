# Seeded faults for the global RULEs, units, aggregation and materials (2026-11-24)

**Question.** `eval/where-rules-seeded-2026-11-24.md` wrote eight fault
families into 24 public files and saw each WHERE rule fire on exactly the
seeded record. Its "Next" named what was left: the schema's two global RULEs
(`IfcSingleProjectInstance`, `IfcRepresentationContextSameWCS`) and families an
IDS check reads less directly (a material on a non-element, an aggregation
cycle, an `IfcSIUnit` with the wrong dimension). Do those rules fire when the
fault is there, and only then?

**Answer.** Yes, with one exception that is in the schema, not the checker.
Seven new families went into 102 public files: 21 web-ifc files, the 35
buildingSMART Sample-Test-Files and the 46 IFC4.3.x sample models. That made
**538 seeds. Each fired under the rule it was aimed at, on the record it was
written into. Nothing else appeared and nothing the original reported went
away.** The eight earlier families ran again on the same 102 files: 745
seeds, all clean, so the whole harness now covers **1,283 seeds in 15
families**.

The exception: **in IFC2X3 and IFC4, moving a context's world origin cannot
break `IfcRepresentationContextSameWCS`.** The rule calls
`IfcSameAxis2Placement`, and in both schemas that function ends with
`IfcSameCartesianPoint(ap1.Location, ap1.Location, Epsilon)`. It compares the
first placement's location with itself. IFC4X3 reads `ap2.Location`. So a
model whose plan context sits 1000 mm away from its 3D context passes the
rule in IFC2X3 and IFC4 and fails it in IFC4X3. The seed family
`context-moved-wcs` writes that fault into all 102 files. It expects a failure
only where the schema compares locations, and that held on every file: 57 of
57 IFC4X3 files fail, 45 of 45 IFC2X3 and IFC4 files pass. A turned axis
(`context-rotated-wcs`) fails in every schema, 102 of 102.

For someone checking IFC4 models, this means the schema rule will not catch a
plan or survey context with its own origin. If that matters, an IDS check or a
separate placement comparison has to.

## The families

| Family | What the seed writes | Rule it should break | Files | Seeds | Fired here |
| --- | --- | --- | ---: | ---: | ---: |
| `second-project` | a copy of the file's `IfcProject` with a new GlobalId | global `IfcSingleProjectInstance` (`SIZEOF(IfcProject) <= 1`) | 102 | 102 | 102 |
| `context-rotated-wcs` | a second root `IfcGeometricRepresentationContext` whose WCS is the first's turned a quarter turn (new RefDirection; a 3D placement with no Axis gets `(0,0,1)` too, or `AxisAndRefDirProvision` joins in) | global `IfcRepresentationContextSameWCS` | 102 | 102 | 102 |
| `context-moved-wcs` | the same, with the origin moved 1000 units along x and the axes kept | the same, but only where `IfcSameAxis2Placement` compares the two locations (IFC4X3) | 102 | 57 | 57 (and 0 of 45 elsewhere, as expected) |
| `si-unit-wrong-dimension` | an `IfcSIUnit` whose Name has another dimension than its UnitType (a LENGTHUNIT named SQUARE_METRE, an AREAUNIT named CUBIC_METRE, ...) | `IfcNamedUnit.WR1` (`IfcCorrectDimensions`) | 102 | 102 | 102 |
| `aggregate-self-reference` | an `IfcRelAggregates` whose whole is listed among its own parts | `IfcRelAggregates.NoSelfReference` (IFC2X3 `IfcRelDecomposes.WR31`); a spatial whole also `IfcSpatialStructureElement.WR41` | 58 | 88 | 88 |
| `material-on-non-element` | an `IfcRelAssociatesMaterial` putting the file's first material on a space or storey (IFC4, IFC4X3) or on the project (IFC2X3, where spaces are products) | `IfcRelAssociatesMaterial.AllowedElements` (IFC2X3 `WR22`) | 72 | 72 | 72 |
| `material-on-opening` | the same on an opening | `IfcRelAssociatesMaterial.NoVoidElement` (IFC2X3 `WR21`) | 15 | 15 | 15 |
| **new, all** | | | | **538** | **538** |

The earlier eight families on the same 102 files:

| Family | Files | Seeds | Fired here |
| --- | ---: | ---: | ---: |
| `userdefined-unnamed` | 77 | 422 | 422 |
| `type-of-another-class` | 51 | 127 | 127 |
| `duplicate-pset-name` | 12 | 28 | 28 |
| `duplicate-property-name` | 27 | 27 | 27 |
| `negative-quantity` | 22 | 65 | 65 |
| `3d-refdirection-in-2d` | 26 | 26 | 26 |
| `3d-location-in-2d` | 26 | 26 | 26 |
| `negative-positive-length` | 13 | 24 | 24 |

## What the first runs taught

- **A self-referencing spatial element breaks two rules.** In 30 of the 58
  files the only aggregation with a whole other than the project is spatial
  (a site holding a building, a storey holding a space). The site that lists
  itself then decomposes twice, and `IfcSpatialStructureElement.WR41` wants
  exactly one decomposition, from the project or another spatial element. The
  first run on the bundled sample showed it. The rule is right, so the seed
  takes an element assembly when the file has one and otherwise expects both
  failures.
- **A turned axis needs both directions.** The first rotated WCS wrote only
  a RefDirection into a placement with no Axis, and
  `IfcAxis2Placement3D.AxisAndRefDirProvision` fired as well. The rule is
  right again: a 3D placement gives both or neither. The seed now writes both.
- **Seeded copies were overwriting each other.** The SketchUp scene is
  `Building-Architecture.ifc` in IFC2X3, IFC4 and IFC4X3, and
  `basin-tessellation.ifc` is in both buildingSMART repositories. The
  harness named copies by base name, so the later file's copies replaced the
  earlier one's. The in-memory check was unaffected, but the IfcOpenShell pass
  reads the files from disk. Later names are now numbered (`-2`, `-3`).
- **The global RULEs report no record.** A failed global RULE has no
  instance, here (`id: null`) or in IfcOpenShell (`instance` None). The
  IfcOpenShell comparison script now reads `null` keys instead of failing on
  them.

## Beside IfcOpenShell

IFCOS_RESULT

## Reproduce

```
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/ThatOpen/engine_web-ifc.git webifc
(cd webifc && git sparse-checkout set --no-cone 'tests/ifcfiles/public/*.ifc' && git checkout)
# + buildingSMART/Sample-Test-Files (5030f65) and buildingSMART/IFC4.3.x-sample-models (ef22440), '*.ifc'
find webifc/tests/ifcfiles/public -name '*.ifc' -size -16M | sort > files.txt
find stf s43 -name '*.ifc' -size -16M | sort >> files.txt       # 102 files
tr '\n' '\0' < files.txt | xargs -0 node --stack-size=8000 eval/where-rules-seeded.mjs /tmp/seeded   # RUN_TIME
python -m venv v && v/bin/pip install ifcopenshell==0.9.0.post1 pytest
v/bin/python eval/where_rules_seeded_ifcopenshell.py /tmp/seeded/manifest.json --jobs 4
```

`where-rules-seeded.test.mjs` pins every family on the bundled sample, and
pins the IFC4 / IFC4X3 split of `context-moved-wcs`.

## Next

- The BCF export and the CI outputs (JUnit, annotations) still do not carry
  the `modelRules` notes.
- A warning of its own for a context whose origin differs from the first
  context's in IFC2X3 and IFC4 files, since their schema rule cannot see it.
  It is a few lines on top of the interpreter: run IFC4X3's
  `IfcSameAxis2Placement` on IFC4 contexts.
