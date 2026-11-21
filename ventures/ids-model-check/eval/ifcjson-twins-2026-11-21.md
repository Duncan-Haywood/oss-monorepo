# ifcJSON read, checked on 97 STEP/ifcJSON twins, 2026-11-21

What was measured: whether `ifcjson.mjs` reads an ifcJSON model into the same
entities as its STEP twin, and whether the checker gives the same verdicts on
both, with the three starter IDS files and 65 public IDS files.

## Files

buildingSMART's ifcJSON repository (`github.com/buildingSMART/ifcJSON`, MIT,
commit `6d9b961`, fetched by `eval/fetch-ifcjson-twins.sh`, not committed)
publishes 97 models as both `X.ifc` and `X.json`, written by two converters
that read ifcJSON differently:

- **IfcOpenShell's ifc2json** (`file_converters/ifc2json.py`), 56 pairs:
  `Samples/IFC_2x3` (2, among them Revit's Duplex, 27,529 STEP entities),
  `Samples/IFC_4.0/BuildingSMARTSpec` (41, buildingSMART's IFC4 Annex E
  examples), `Samples/IFC_4.3/Georeferencing_1` (1) and the Bentley Building
  Designer NURBS faces (12). A header names the schema
  (`"schemaIdentifier": "IFC4"`); every rooted object sits at the top of
  `data`; a link to one is `{"type": "IfcOwnerHistory", "ref": "<uuid>"}`;
  other objects are nested in full where they are used; simple values are bare
  (`"name": "Project"`), select values wrapped (`{"type": "IfcLabel",
  "value": "x"}`).
- **IFC.JAVA** (Jackson), 41 pairs in `Samples/buildingSMART_TestSet_JAVA`,
  the same Annex E examples: no header, one object at the root, every value
  wrapped, a second use of an object written as its bare id string, and
  relationships nested under inverse attributes (`isDecomposedBy`,
  `containsElements`, `isDefinedBy`) with their pointer back to the parent
  left out.

Both write GlobalIds as UUIDs (`22e66ddf-794d-40bb-8aa5-3dda450d8255`); the
reader turns them back into IFC's 22-character form (`0YvctVUKr0kugbFTf53O9L`,
the hello-wall project's STEP GlobalId), so failing elements, BCF issues and
an IDS on GlobalId see what the STEP file says.

## Method

`node eval/ifcxml-twins.mjs --ext .json --deep --ids-dir eval/corpus/real
eval/twins/ifcjson/Samples` (the ifcXML twin script, given an extension, a
recursive walk and an IDS folder): each entity hashed as its class plus its
values with references replaced by the hash of their target; entities with a
GlobalId paired and compared attribute by attribute; and every IDS checked on
both forms. A verdict is "identical" when every specification's status,
applicable count and full list of failing elements (GlobalId, or null for an
object without one) match; "same for a user" when status and the failing
GlobalIds (the BCF issues) match.

## Result

| | main (`8aefb4d`) | this change |
| --- | --- | --- |
| ifcJSON files read | 0 of 97 (read as STEP: no entities) | 97 of 97 |
| starter IDS verdicts identical (97 x 3) | - | 291 of 291 |
| all IDS verdicts identical (97 x 68) | - | 6,485 of 6,596 |
| same status and failing GlobalIds | - | 6,552 of 6,596 |
| GlobalIds paired with the STEP twin | - | 5,743 of 5,749 |
| entities, STEP / JSON | 59,733 / - | 59,733 / 54,416 |

Of the 6 unpaired "GlobalIds", one is not a GlobalId: structural-curve-member's
IfcProfileProperties is named `Pset_ProfileMechanical`, 22 characters of the
GlobalId alphabet, which the twin script's pattern takes for one. The other 5
and all 44 verdicts that differ for a user come from
what a converter wrote, not from the reader; each kind was read by hand:

- **IfcOpenShell's ifc2json drops empty strings and empty properties**
  (`getAttributeValue`: `if value == None or value == ''`; `empty_property`).
  STEP's `IFCPROJECT(...,'',...)` Phase becomes an absent key, and a
  property set whose properties are all empty is written with
  `hasProperties: []`. One public IDS (NL BIM Basis ILS, an IDS 0.9 file
  whose attribute facet has an unreadable `<n>` name, so it applies to every
  object) then selects a slightly different set of objects: 77 property sets
  fail only on STEP, and 74 spaces, projects, proxies and property templates
  only on JSON.
- **IFC.JAVA leaves out objects reachable only through inverses it does not
  write**: four IfcRelConnectsPathElements in construction-scheduling-task,
  the IfcProjectLibrary in wall-with-opening-and-window, and the
  IfcMapConversion in geographic-referencing (so "Map conversion"
  specifications in miniGIM and buildingSMART Portugal's IDS pass on STEP and
  find nothing on JSON). It also leaves out an IfcGeometricRepresentationSubContext's
  ParentContext.

The 67 verdicts that differ only in counts are specifications that apply to
every object, where the STEP file holds geometry nothing rooted points at
(1,386 such entities across the 97 files) or writes the same point twice.

## What the reader does about the formats' gaps

- **No header**: the schema that knows the most class names is used, IFC4 on
  a tie (all 41 Java files: IFC4, as their STEP twins say), and said once.
- **Objects written in full at each use**: an object with no globalId is one
  entity per distinct class and values, as a STEP file writes one line and
  points at it. Without this the 97 files read as 126,359 entities against
  STEP's 59,733 (6.RectWithHole: 15,943 against 5,160); with it 54,416
  (5,040).
- **An untyped object** where the schema wants an entity
  (`unitsInContext: {"units": [...]}`, an owner history's
  `owningApplication`) is an instance of the attribute's class.
- **An empty wrapper** (`{"type": "IfcLabel"}`, the Java writer's `''`) is an
  empty string, not null.
- **Points where numbers belong** (the Java writer's IfcCartesianPointList3D
  `coordList` as IfcCartesianPoint objects) are read as the coordinate rows.
- **A converter's globalId on a class with none** (owner histories, contexts,
  shape representations) only identifies the object; derived attributes the
  Java writer serialises (`dim`, `scl2`) are skipped silently.

## Limits

- ifcJSON is a draft with no released schema; these two converters are the
  only public writers found, and both are a few years old. A third writer may
  choose differently (compact `{"ref"}` without a type is read; camelCase in
  any case is read).
- The file is parsed with `JSON.parse`, so it must fit in one JavaScript
  string (about 537 MB) and is held whole; the Duplex model's 19.9 MB JSON
  reads in under a second.
- Not measured against IfcTester: IfcOpenShell has no ifcJSON reader.

## Regression

The ifcXML twins (`eval/ifcxml-twins-2026-11-18.md`) with the script's new
options unused: 43 pairs, IDS verdicts 129 of 129 identical, as before. The
venture's test suite passes (`python3 platform/ci/run_venture_tests.py
ids-model-check`), with `ifcjson.test.mjs` added (both flavours, schema
inference, GUID compression, errors, the .ifczip pick).
