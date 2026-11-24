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

`ifcopenshell.validate` 0.9.0.post1 (`express_rules=True`) ran on the 542
seeded copies of the seven new families in the 100 files it opens (it refuses
web-ifc's IFC4X2 bridge and IFC4X3_RC2 road). **It gives the same answer:
526 of 526 seeds fired, and the same new failures as here on all 542
copies.** That includes the schema's typo. IfcOpenShell reads the same `.exp`
text, so it also passes the moved origin in all 44 IFC2X3 and IFC4 files it
opens, and fails it in all 56 IFC4X3 ones.

| Family | Files | Seeds | Fired | Extra | Missed | Same new failures as here |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `second-project` | 100 | 100 | 100 | 0 | 0 | 100 |
| `context-rotated-wcs` | 100 | 100 | 100 | 0 | 0 | 100 |
| `context-moved-wcs` | 100 | 56 | 56 | 0 | 0 | 100 |
| `si-unit-wrong-dimension` | 100 | 100 | 100 | 0 | 0 | 100 |
| `aggregate-self-reference` | 56 | 84 | 84 | 0 | 0 | 56 |
| `material-on-non-element` | 71 | 71 | 71 | 0 | 0 | 71 |
| `material-on-opening` | 15 | 15 | 15 | 0 | 0 | 15 |

It took 11 min 24 s with 4 workers; the harness here took 3 min 54 s for all
15 families on all 102 files.

## The `context-origin` note

`conformance.mjs` now checks whether the schema's `IfcSameAxis2Placement`
compares `ap1.Location` with itself. If it does and
`IfcRepresentationContextSameWCS` passed, it runs that one global rule again
with IFC4X3's comparison, using the same interpreter, derived attributes and
functions, with no other WHERE rule. If that run fails, the model gets a
`context-origin` finding that names the contexts and says why the schema
rule missed it. None of the 102 public originals gets it, nor do
IfcOpenShell's `annotation.ifc` and `bug_2517_test2.ifc`, whose context rule
is UNKNOWN (`eval/where-rules-2026-11-24.md`). All 45 IFC2X3 and IFC4
moved-origin copies get it. A turned axis, which the schema rule does catch,
gets no second note, and neither does IFC4X3. `where-rules-seeded.test.mjs`
pins all four cases.

## Reproduce

```
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/ThatOpen/engine_web-ifc.git webifc
(cd webifc && git sparse-checkout set --no-cone 'tests/ifcfiles/public/*.ifc' && git checkout)
# + buildingSMART/Sample-Test-Files (5030f65) and buildingSMART/IFC4.3.x-sample-models (ef22440), '*.ifc'
find webifc/tests/ifcfiles/public -name '*.ifc' -size -16M | sort > files.txt
find stf s43 -name '*.ifc' -size -16M | sort >> files.txt       # 102 files
tr '\n' '\0' < files.txt | xargs -0 node --stack-size=8000 eval/where-rules-seeded.mjs /tmp/seeded   # 3 min 54 s
python -m venv v && v/bin/pip install ifcopenshell==0.9.0.post1 pytest
v/bin/python eval/where_rules_seeded_ifcopenshell.py /tmp/seeded/manifest.json --jobs 4   # leave out the IFC4X2 and IFC4X3_RC2 files' entries: it refuses them
```

`where-rules-seeded.test.mjs` pins every family on the bundled sample, and
pins the IFC4 / IFC4X3 split of `context-moved-wcs`.

## Next

- The BCF export and the CI outputs (JUnit, annotations) still do not carry
  the `modelRules` notes.
- An `IfcRelAggregates` cycle across two records (A holds B, B holds A). No
  WHERE rule names it, so measure what catches it (inverse counts, a spatial
  WR41) and add a check if nothing does.
- Look for other self-comparisons like `ap1.Location, ap1.Location` in the
  three schemas' functions (an argument compared with itself).
