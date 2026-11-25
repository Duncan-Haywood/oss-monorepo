# Inverse counts: the last place the conformance pass and ifcopenshell.validate differed (2026-11-24)

**Question.** `eval/conformance-2026-11-24.md` left one kind of
`ifcopenshell.validate` line unchecked: inverse cardinalities, 47 lines on
IfcOpenShell's 293 files and 1,038 on web-ifc's 108. An INVERSE in the EXPRESS
schema says how many records may point at a record through one attribute.
For example, IFC4 `IfcFeatureElementSubtraction.VoidsElements : IfcRelVoidsElement FOR
RelatedOpeningElement` means one opening voids exactly one element. Can this
pass count them as IfcOpenShell does, and what do the public files' counts
mean for someone reading the model?

**Answer.** Yes. `conformance.mjs` now counts every bounded inverse (code
`inverse-count`). On the 492 public files it agrees with ifcopenshell.validate
record for record, with **0 lines IfcOpenShell gives that this misses** (it
missed 1,085 before), and the same files are flagged on every set:

| Set | Files | Inverse lines, IfcOpenShell | Matched here, same record | Only here |
| --- | ---: | ---: | ---: | ---: |
| IfcOpenShell `16f9a41` | 293 | 47 | 47 | 0 |
| ThatOpen engine_web-ifc | 108 | 1,038 | 1,038 | 8 (ifcbridge-model01, which IfcOpenShell will not open) |
| buildingSMART IFC4.3.x-sample-models | 46 | 0 | 0 | 0 |
| buildingSMART Sample-Test-Files | 35 | 0 | 0 | 0 |
| opensourceBIM IFC-files | 8 | 0 | 0 | 0 |

All records, all codes: IfcOpenShell's set is 275 flagged by both, 10 only
here (the `$` in derived slots and two header lines described before), and 0
only by IfcOpenShell. web-ifc's is 2,344 by both, 234 only here, and 0 only by IfcOpenShell.
`--no-inverse` on `eval/conformance_compare.py` gives the old split.

## How

`schema/gen-schema.mjs` now writes `inverseBounds` beside `inverseFor`: each
inverse whose bound is not `[0:?]`, as `[min, max]`. A bare
`Name : IfcRelX FOR Attr` is `[1, 1]`. A third element `true` means repeats
count. That is a bare inverse or a BAG, where a record listing the target twice
counts twice; a SET counts each pointing record once. There are 48 such inverses
in IFC2X3 and IFC4 and 52 in IFC4X3. The generator was re-run on the same
`.exp` files as before (web-ifc's `src/schema-generator/`), which still
reproduce the committed JSON apart from the new field.

The pass finds every relationship class and attribute those inverses name. It
indexes, per record, which records point at it through each one, then checks
each record's count against its class's bounds. A subtype's redeclaration of an
inverse wins over its supertype's. Three details were needed to match
IfcOpenShell. Each came from a first run that did not match:

1. **Repeats.** dental_clinic.ifc's `#142812=IfcMaterialLayerSet((#31918,#31917,#31918),...)`
   lists one layer twice. `ToMaterialLayerSet` is a bare inverse, so that is 2
   where the schema gives 1. A first run counted distinct records and missed it.
2. **Records with the wrong attribute count still point.** example.ifc's
   `IFCSPACE` has 8 attributes where IFC2X3 gives 11. Its placement and shape
   came out as used by nothing. IfcOpenShell reads such a record by position,
   and so does this pass now. The record itself is already an
   `attribute-count` finding.
3. **Pointers of a class outside the schema.** beam-standard-case.ifc (IFC4X3)
   writes `IFCBEAMSTANDARDCASE`, an IFC4 class. Its 18 shapes are then used by
   no IFC4X3 product. IfcOpenShell reports them, and so does this pass, with
   the outside class named as the likelier fault. A first version left them out
   and fell 18 short.

Cost: web-ifc's 110 files (485 MB) sweep in 20 s, against 15.8 s without the
inverse pass. A first version took 26 s. It now works out, once per class, which
slots can point (most classes have none).

## What the counts mean

Each finding's message says what the count does to someone reading the model.
Most of these do not change any value an IDS check reads:

| Inverse | Public files | Count | What it means |
| --- | --- | --- | --- |
| IFC2X3 `IfcProductDefinitionShape.ShapeOfProduct [1:1]` | 11 IfcOpenShell `rules/` fixtures, example.ifc, ISSUE_129 (14) | 0 or 2 | A shape no product uses, or one shared by two products. IFC2X3 shares geometry through IfcRepresentationMap and IfcMappedItem |
| IFC4/IFC4X3 `ShapeOfProduct [1:?]` | basic.ifc (Bonsai, ifcpatch: 2 each), beam-standard-case.ifc (18), ifcbridge-model01 (8) | 0 | A shape no product uses |
| IFC2X3 `IfcObjectPlacement.PlacesObject [1:1]` | 6 IfcOpenShell files, ISSUE_021 (6), ISSUE_034 (5), ISSUE_129 (14) | 0 or 2 | Often a placement that only other placements are relative to. Harmless to read |
| IFC2X3 `IfcPropertySetDefinition.DefinesType [0:1]` | ISSUE_068 ARK_NUS (808 sets), ISSUE_129 (64) | 2-169 (ARK_NUS), 2-111 (ISSUE_129) | One property set on many types. Each type reads the same values, but an edit to one changes all |
| `IfcRepresentationItem.StyledByItem [0:1]` | dental_clinic (89 solids) | 2-8 | Several styles on one item. Its colour depends on which one a viewer takes |
| `IfcMaterialLayer.ToMaterialLayerSet [1:1]` | dental_clinic (4 layers) | 2-7 | One layer in several sets, or listed twice in one |
| IFC2X3 `IfcPort.ContainedIn [1:1]` | advanced_model (34 ports) | 0 | A port in no element. A system check cannot tell what it connects |
| `IfcFeatureElementSubtraction.VoidsElements [1:1]` | manifold_vert_attr_count_bug_9748 (4) | 0 | An opening that voids nothing. A takeoff subtracts it from nothing |
| `IfcMaterialUsageDefinition.AssociatedTo [1:?]` | ColumnPSetsOfSets (1) | 0 | A profile set usage nothing is given |

The earlier note guessed that most of these lines were shapes and placements
*shared* by types. The counts show otherwise: on IfcOpenShell's files every one
is a count of 0 (unused), and the shared cases (2 or more) are in web-ifc's
files.

One inverse an IDS check does follow: `ContainedInStructure`,
`Decomposes`, `FillsVoids` and `Nests` are `[0:1]`. A wall in two storeys
makes a `partOf` facet's answer depend on which link a tool takes, and the
message says so. None of the 492 public files has one.

**Our own sample had a fault.** `samples/tiny-house.ifc` listed its gypsum
lining layer twice in one set, `(#72,#73,#72)`, the dental-clinic pattern. It
now has a second lining layer, `#76`. The ifcXML twin and the `.ifczip` were
rewritten to match, and every sample test still passes.

## Reproduce

```
sh eval/fetch-ifcopenshell-samples.sh
node eval/conformance-sweep.mjs eval/ifcopenshell --json /tmp/ours.json
python -m venv v && v/bin/pip install ifcopenshell        # 0.9.0.post1 here
v/bin/python eval/conformance_ifcopenshell.py eval/ifcopenshell > /tmp/ios.jsonl   # 11 s
python3 eval/conformance_compare.py /tmp/ours.json /tmp/ios.jsonl
```

web-ifc's files are a sparse clone of `*.ifc` from
`github.com/ThatOpen/engine_web-ifc`. IfcOpenShell's run on them is the slow
step (the earlier note measured about 50 minutes; run it in the background).

## Left

WHERE rules and functions (`express_rules=True`), and the inverse bounds of
`LIST` inverses, which no IFC schema here uses.
