# Schema conformance: IfcOpenShell's labelled broken files, and ifcopenshell.validate on 492 public files (2026-11-24)

**Question.** `eval/ifcopenshell-test-files-2026-11-24.md` left this item open:
IfcOpenShell's `test/fixtures/validate` folder is a labelled set of broken files,
each `fail-*` file with one known fault, each `pass-*` file clean. How many of
those faults does this checker say anything about? An IDS check reads values
by position and type, so a file that breaks its own schema can make a
check test the wrong value, or skip one, without a word.

**Before.** 1 of 25. The `Model` reader noted `fail-expected-3-invalid-entity.ifc`
(an `IFCBUILTELEMENT` in an IFC4 file, a class outside the schema) and
`duplicateGlobalIds` caught the three duplicated-GUID files. That makes 4 of
25 with any finding, and nothing on the other 21.

**After.** `conformance.mjs` (CLI `--conformance`; a model warning in every check
of a STEP file up to 40 MB, page and CLI): **25 of 25 `fail-*` files flagged with
their fault, 0 findings on the 13 `pass-*` files.** Script:
`node eval/conformance-sweep.mjs eval/ifcopenshell/src/ifcopenshell-python/test/fixtures/validate`.

| Fixture | Finding |
| --- | --- |
| fail-attr-too-few / too-many | `attribute-count`: IFCPERSON has 7 (9), IFC4 IfcPerson has 8 |
| fail-derived-as-nil, fail-nil-as-derived (same bytes) | `derived-in-explicit`: IFCSIUNIT.Prefix written `*` |
| fail-duplicated-application-id / -name-version | `duplicate-application` (IfcApplication UR1, UR2) |
| fail-duplicated-guids-ifc2x3/4/4x3 | `duplicateGlobalIds` (ids.mjs, already) |
| fail-expected-2-header-attr-too-few, fail-header-attr-too-many | `header-count`: FILE_NAME has 6 (8) fields, ISO 10303-21 gives 7 |
| fail-header-wrong-type-* (3) | `header-type`: `$` or `(4, 5)` where a string or list of strings belongs |
| fail-expected-2-invalid-selected-enumeration | `bad-enum`: `.NOT_EXISTING_ENUM.` in IFCNULLSTYLE |
| fail-expected-2-selected-simple-type-empty-typed-value | `typed-empty`: `IFCREAL()` |
| fail-expected-2-selected-simple-type-non-existant-type | `typed-unknown-type`: `IFCNONEXISTANTTYPE(0.1)` |
| fail-expected-3-invalid-entity | reader note (outside-schema class), plus `reference-outside-schema` on the IfcRelAssociatesMaterial pointing at it |
| fail-group-0-rels / 2-rels (IFC2X3) | `group-assignments`: RelatingGroup of 0 (2) IfcRelAssignsToGroup |
| fail-invalid-entity-in-attribute | `nan`: `nan.` makes the record unreadable |
| fail-invalid-selected-simple-type | `wrong-literal`: `IFCPOSITIVELENGTHMEASURE('1')` |
| fail-selected-simple-type-as-literal | `untyped-in-select`: bare `0.2` in IfcValue |
| fail-selected-simple-type-wrong-literal | `wrong-literal`: `IFCLABEL(0.5)` |
| fail-simple-type-as-typed-value | `typed-in-simple`: `IFCAREAMEASURE(5.4)` where AreaValue takes a bare value |

## What it checks, and what it does not

Per record, against the declared schema (`schema/*.json`):
the attribute count; `*` only in derived slots (the union of DERIVE
redeclarations up the supertype chain) and never `$` there; `$` only in OPTIONAL
slots; references to records that exist, are in the schema, and are of an
allowed class (through selects, expanded); typed values in selects (the type
exists, the select allows it, it holds something, the inside is the right
kind); a type name around a value that is not in a select; enumeration values
(and `.T.`/`.F.`/`.U.` against BOOLEAN/LOGICAL); NaN and unreadable records;
the outer list's least size and fixed inner sizes; abstract classes written
as records. Per file: the three header records' shapes and `[1:?]` lists
(ISO 10303-21), IfcApplication's two UNIQUE rules, IFC2X3 IfcGroup.IsGroupedBy
exactly one. A draft schema (IFC4X3_RC*) gets a first note that it was read as
IFC4X3_ADD2.

To carry the list bounds, `schema/gen-schema.mjs` now writes `min` on an
aggregate attribute whose lower bound is 1 or more (144 `min: 1`, 21 `min: 2`, 4
`min: 3` in IFC4). It was re-run on the same `.exp` files
(`ThatOpen/engine_web-ifc` `src/schema-generator/`), which first reproduced the
committed JSON exactly. The only change is the new field.

Not checked: inverse cardinalities (except the IFC2X3 group rule), WHERE rules
and functions (`express_rules=True` in IfcOpenShell), INTEGER written as a real
(the reader does not keep the token's form), and string lengths.

## Set beside ifcopenshell.validate, 492 public files

`eval/conformance_ifcopenshell.py` runs `ifcopenshell.validate.validate(path,
json_logger, express_rules=False)` (ifcopenshell 0.9.0.post1 from PyPI) on each
file. `eval/conformance_compare.py` sets its lines beside the sweep's JSON,
file by file and record by record. It counts two kinds of IfcOpenShell line
apart, because this checker reports them elsewhere: classes outside the schema
(`Model` reader notes) and IfcRoot's GlobalId UNIQUE rule
(`duplicateGlobalIds`). It also counts inverse cardinalities apart, because
they are not checked here.

| Set | Files | Clean in both | Flagged by both | Only here | Only IfcOpenShell | Records both / only here / only IfcOpenShell | Inverse lines set apart |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| IfcOpenShell `16f9a41` (all .ifc) | 293 | 154 | 139 | 0 | 0 | 228 / 10 / 0 | 47 |
| buildingSMART IFC4.3.x-sample-models `ef22440` | 46 | 45 | 1 | 0 | 0 | 1 / 0 / 0 | 0 |
| buildingSMART Sample-Test-Files (HEAD 2026-11-24) | 35 | 35 | 0 | 0 | 0 | 0 / 0 / 0 | 0 |
| opensourceBIM IFC-files (HEAD 2026-11-24) | 8 | 6 | 2 | 0 | 0 | 5 / 0 / 0 | 0 |
| ThatOpen engine_web-ifc (all .ifc, HEAD 2026-11-24) | 108 of 110 | 89 | 19 | 0 | 0 | 1,306 / 226 / 0 | 1,038 |

Web-ifc's other 2 files are its `malformed-input` fixtures (an unterminated
string or comment), which neither tool reads. **The same files flagged, file for
file, on every set: 492 of 492.** The records only
here are of two kinds:

- `$` in a derived slot (IFC4X3 `IFCSIUNIT($,...)` in IfcOpenShell's
  `beam-standard-case.ifc`, 8 records). ISO 10303-21 writes a redeclared
  derived attribute as `*`. IfcOpenShell accepts `$` there. This checker
  reports it.
- `KIT-Simple-Road-Test-Web-IFC4x3_RC2.ifc` and `ifcbridge-model01.ifc`
  (IFC4X2, below), both web-ifc: IfcOpenShell refuses each file ("Unsupported
  schema"). Here it is read as IFC4X3_ADD2,
  behind the draft-schema note, and RC2's IfcFacilityPart (abstract in ADD2,
  one attribute more) and IfcRoad (one fewer) are listed.

The rest are header findings, which IfcOpenShell reports on the same files
with no record id.

## What the public files hold

- `bonsai/.../classifications/NL_SfB_tabel_1_2019.ifc`: 1,010
  `IFCCLASSIFICATIONREFERENCE($,'0-','PROJECT TOTAAL',#2,$$)` records, `$$`
  with no comma, so none can be read. Its IfcClassification also has 6
  attributes, where IFC4 gives it 7.
- `ifcopenshell/util/schema/Pset_IFC4_ADD2.ifc` (IfcOpenShell's own template
  file): three IfcSimplePropertyTemplates with 11 attributes, OwnerHistory
  left out, so every later value is one slot off (`.P_SINGLEVALUE.` lands in
  Description's place). Also 21 GlobalIds shared by 155 templates
  (`duplicateGlobalIds`, already).
- Bonsai's `IFC2X3 Demo Library.ifc` and `IFC2X3 Demo Template.ifc`: four
  IfcOwnerHistory records whose OwningApplication and
  LastModifyingApplication are `#240`, an IFCCARTESIANPOINT.
- `ifcbridge-model01.ifc` (web-ifc) declares `IFC4X2`, the draft bridge schema
  before IFC4X3. Like the IDS check, this pass reads it as IFC4. There, 28
  IfcPlate `.BASE_PLATE.`, 10 IfcWall `.RETAININGWALL.`, 8 IfcBeam `.EDGEBEAM.`
  and 4 IfcDiscreteAccessory `.EXPANSION_JOINT_DEVICE.` are not IFC4 values,
  and 40+ references go to IFC4X2 classes (IfcBridge and its parts). A first
  reading called these IFC4X3 values in an IFC4 file. The comparison showed
  IfcOpenShell refusing the file ("Unsupported schema: ifc4x2"), which gave
  away the real schema. The draft-schema note now covers IFC4X1 and IFC4X2
  (read as IFC4) as well as IFC4X3_RC*.
- `FM_ARC_DigitalHub.ifc` (web-ifc, IFC4): 940 IfcCurveBoundedPlane with `$`
  for InnerBoundaries, a required SET [0:?] (`()` for none), and 184
  IfcRelSpaceBoundary with no RelatedBuildingElement (required in IFC4,
  optional in IFC2X3).
- Required slots unset across IfcOpenShell's files: 37 IfcProjectLibrary
  GlobalIds (Bonsai's classification libraries), 16 IFC2X3 IfcSite
  CompositionType, 5 IfcSIUnit UnitType and others (100 in 73 files).
- 76 of IfcOpenShell's 293 files write `()` for FILE_NAME author and
  organization, which ISO 10303-21 gives as LIST [1:?]. IfcOpenShell's
  validator flags these files too.

## Speed

Sweep, all files, one core: IfcOpenShell's 293 in 1.1 s, web-ifc's 110 (485 MB)
in 15 s. ifcopenshell.validate took about 50 minutes for web-ifc's. On the page the
pass reads the file a second time, eagerly, so it is limited to STEP files up
to 40 MB.

## Reproduce

```
sh eval/fetch-ifcopenshell-samples.sh
node eval/conformance-sweep.mjs eval/ifcopenshell --json /tmp/ours.json
python -m venv v && v/bin/pip install ifcopenshell
v/bin/python eval/conformance_ifcopenshell.py eval/ifcopenshell > /tmp/ios.jsonl
python3 eval/conformance_compare.py /tmp/ours.json /tmp/ios.jsonl
```

The other sets are sparse clones of `*.ifc` from
`github.com/buildingSMART/IFC4.3.x-sample-models`,
`github.com/buildingSMART/Sample-Test-Files`,
`github.com/opensourceBIM/IFC-files` and `github.com/ThatOpen/engine_web-ifc`
(not committed here).

## Next

Inverse cardinalities, which is where the two tools still differ (47 lines on
IfcOpenShell's files, 1,038 on web-ifc's). The schema JSON keeps inverse names and
`inverseFor`, but not their bounds. Most of these lines are IFC2X3
`ShapeOfProduct [1:1]` on representations shared by types, and
`PlacesObject [1:1]` on shared placements. Worth adding only as notes that
explain those two cases. As blanket faults they would be noise.
