# STEP to ifcXML, checked against buildingSMART's XSDs (2026-11-24)

`node cli.mjs --to-ifcxml model.ifc -o model.ifcxml` (`ifcxml-writer.mjs`)
writes an IFC4 or IFC4X3 STEP model as ifcXML. This report covers how its
layout was settled and how it was checked.

## The starting point failed the XSD

`eval/ifc4-layout.mjs` (2026-11-18) wrote the nested IFC4 layout by copying
real files (GeometryGymIFC, buildingSMART's Annex E examples), and our reader
read 857,301 of 857,301 entities back. Its output for `samples/tiny-house.ifc`
failed `xmllint --schema IFC4_ADD2.xsd` at the first element under the
project (`IsDecomposedBy` was not expected), and then at `FillsVoids` (an
inverse this XSD does not have). A reader that takes anything can't tell you
whether a writer is right.

## What the XSD fixes, read from it

`schema/gen-ifcxml-layout.py` reads each entity's complexType into
`schema/ifcxml-layout-<schema>.json`, keeping names only:

- **XML attributes and child elements.** Simple values and number lists are
  attributes. Entity references, selects, lists of entities and some string
  lists (AddressLines) are elements.
- **Element order.** Checked for every IFC4 class: each level's elements are
  its own explicit attributes in EXPRESS order, then its exposed inverses,
  and the levels run supertype first. There were 0 exceptions in 776 classes.
- **Exposed inverses.** 23 in 15 classes in IFC4. Some hold a list
  (`IsDefinedBy`, `IsDecomposedBy`, `ContainsElements`). Nine are the
  relationship itself (`=HasOpenings:1`: `<HasOpenings GlobalId="..">` is an
  IfcRelVoidsElement), allowed once in IFC4.
- **Pointers left out.** IFC4 drops 21 attributes, each a relationship's
  pointer back to the object it nests under: IfcRelAggregates.RelatingObject,
  IfcRelDefinesByProperties.RelatedObjects, IfcRelVoidsElement.RelatingBuildingElement
  and so on. A relationship with such a pointer has to be written under every
  object it points at: in full under the first, by `href` under the rest.
- **Lists of lists.** These are flat (`cType="list list"`), apart from
  `InnerCoordIndices`, whose rows the XSD wraps in
  `Seq-IfcPositiveInteger-wrapper`.
- **Restrictions.** IFC4X3's `IfcMirroredProfileDef` is an
  `xs:restriction`, so it lists every level itself and is marked as a full
  list. IFC4X3's `-temp` restriction types (IfcSIUnit-temp and two others)
  only drop derived attributes, which the writer skips anyway.

The XSDs come from `github.com/buildingSMART/Standards-builds` at `0c0b3d1`
(`eval/fetch-ifcxml-xsd.sh`): `IFC/RELEASE/IFC4/ADD2/XML/IFC4_ADD2.xsd`
(namespace `http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2`, the one the
41 Annex E ifcXML examples use) and `IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.xsd`.

## Two places where the XSD can't hold the model

1. **IFC4 allows one `HasOpenings` per element** (`maxOccurs="1"`;
   IFC4_ADD2.xsd, the ADD2 TC1 `IFC4.xsd` and the annex copy all agree),
   while EXPRESS gives `SET [0:?]`. IfcRelVoidsElement has no
   `RelatingBuildingElement` element, so a wall's second opening has no valid
   place. IFC4X3's XSD writes `maxOccurs="?"`, which means it was meant to
   lift the limit, but that is not a valid value (see below).
2. **IfcShapeAspect on an IfcRepresentationMap.** `PartOfProductDefinitionShape`
   is dropped, and only IfcProductDefinitionShape exposes `HasShapeAspects`.
   A shape aspect of a type's representation map therefore has nowhere to go.

In both cases the writer keeps the pointer: the relationship is written at
the top level with the element the XSD leaves out. The file reads back whole
but breaks the XSD at that element. `stats.keptPointers` counts these, and
the command lists them and exits 1. Keeping the data was chosen over a valid
file that loses it.

## IFC4X3 ADD2's XSD does not compile

`xmllint` refuses `IFC4X3_ADD2.xsd` as published: `maxOccurs="?"` on
HasProjections, HasOpenings and HasFillings. With those set to `unbounded`
locally, it next refuses `IfcPixelTexture.Pixel` (a list of `IfcBinary`, a
complex type), `IfcSite.RefLatitude` and `RefLongitude` (typed
`IfcCompoundPlaneAngleMeasure`, also a complex type), and with those patched,
`IfcSIUnit-temp` (a restriction of a type with element content). The
development build `IFC4X3_ADD2_DEV_20260526.xsd` has no `?` but fails the same
type references. IFC4X3 exports follow the XSD's layout table and are checked
by reading back only.

## Checks

`node eval/ifcxml-export.mjs --xsd-dir eval/xsd FILES` writes each file,
validates it with `xmllint --stream`, reads it back with `ifcxml.mjs` and
compares every entity's arguments with the STEP reader's. Sets of related
objects are compared as sets and binaries as bytes.
`node eval/ifc4-layout-verdicts.mjs --xsd-layout "a.ifc|b.ifc" IDS...`
compares the checker's verdicts on each export with those on its STEP file.

### buildingSMART's 41 IFC4 ADD2 TC1 Annex E STEP examples, and the sample

| | files | entities |
|---|---|---|
| read back identical | 37 | 5,125 of 5,130 entities overall |
| validate against IFC4_ADD2.xsd | 37 of 42 | |

The 5 entities that differ are the source files disagreeing with the IFC4
ADD2 TC1 schema:

- `beam-varying-profiles.ifc` #300 is an IFCCIRCLEPROFILEDEF with 5 arguments
  where the schema has 4. The fifth is not written.
- The three `tessellation-with-*-texture.ifc` files write
  IfcTriangulatedFaceSet.PnIndex as a list of lists. The schema has a flat
  list, so it is written flat.
- `wall-elemented-case.ifc` #154 points at #161, which the file does not
  contain. The reference is left out (`danglingRefs`).

The 5 files that fail the XSD:

- `slab-openings.ifc` and `wall-elemented-case.ifc` each have an element with
  a second opening.
- The three texture files write IfcIndexedTriangleTextureMap.Maps, which is
  required, as `$`.

The first full run found four writer faults, all fixed before the table
above:

- Lists of lists were wrapped per row. B-spline control points and
  IfcStructuralLoadConfiguration.Locations are now flat with
  `ifc:arraySize="rows columns"`, and the reader cuts them back into rows
  from it.
- STEP's binary leading digit was written into `xs:hexBinary`.
- A texture's `RasterCode` was written as a wrapper instead of the element's
  own text.
- A dangling reference was written as an element naming the abstract class.

### Five public exports (ThatOpen/engine_web-ifc `024cd31`, tests/ifcfiles/public)

| export | schema | STEP | ifcXML | entities | read back | write | nested rels | kept pointers | XSD errors |
|---|---|---|---|---|---|---|---|---|---|
| AC20-FZK-Haus (ARCHICAD) | IFC4 | 2.6 MB | 4.9 MB | 44,249 | 44,249 | 0.3 s | 942 | 8 | 13 |
| C20-Institute-Var-2 (ARCHICAD) | IFC4 | 10.9 MB | 18.8 MB | 147,712 | 147,712 | 1.0 s | 5,541 | 238 | 246 |
| FM_ARC_DigitalHub (Revit) | IFC4 | 14.3 MB | 33.1 MB | 266,483 | 266,483 | 1.2 s | 3,873 | 186 | 1,310 |
| ISSUE_159_kleine_Wohnung_R22 | IFC4 | 10.2 MB | 24.7 MB | 189,788 | 189,788 | 0.9 s | 6,841 | 248 | 248 |
| Viadotto Acerno (bridge) | IFC4X3_ADD2 | 33.0 MB | 37.2 MB | 253,318 | 253,318 | 1.3 s | 1,928 | 0 | (XSD does not compile) |

All 901,550 entities read back identical.

Every one of the 1,817 XSD errors in the four IFC4 files is accounted for:

- **680 kept pointers.** 527 are an element's second or later opening; 153
  are shape aspects of representation maps (ISSUE_159).
- **1,137 required attributes the source file left `$`.**
  IfcCurveBoundedPlane.InnerBoundaries is `$` 940 times in FM_ARC.
  IfcRelSpaceBoundary.RelatedBuildingElement is `$` on virtual boundaries
  (5, 8 and 184 times). `node cli.mjs --conformance` reports the same
  attributes on the STEP files.

### IDS verdicts

The checker's verdicts on the sample and the five exports, with the 3
starter IDS files plus the 65 public ones from `eval/fetch-audit-corpus.sh`
(540 verdicts per model), are identical on each export and its STEP file:
3,240 of 3,240.

### The reader fault it found

IFC4X3 ADD2's own namespace is `https://standards.buildingsmart.org/IFC/RELEASE/IFC4/3/ADD2`.
`ifcXmlSchemaId` looked for `IFC4X3`, `IFC4_3` or `IFC4x3`, so an ifcXML file
in that namespace opened as IFC4. Viadotto Acerno's export read 86,700
entities as IFC4, and 127 of its 540 verdicts differed from the STEP file.
`IFC4/3/` now reads as IFC4X3 (`ifcxml.test.mjs`), and the bridge gives 540
of 540.

## Limits

- No second reader has opened the output yet. xBIM and GeometryGymIFC are
  .NET, and neither runs here. The XSD and our own reader are the checks.
- A string inside an XSD list attribute (IfcTelecomAddress.TelephoneNumbers)
  that contains a space is split by any reader. It is counted
  (`spacedListItems`) and was never seen in these files.
- A list of lists with rows of different lengths cannot be written flat
  with one `arraySize`. It keeps its row wrappers (invalid XSD) and is
  counted (`raggedLists`). This never happened in these files.
- IFC2X3's ifcXML is another layout (`uos`, flat) and is not written. The
  IFC4X1 and IFC4X2 drafts are refused.
- The page has no "Download as .ifcxml" yet (NEXT.md).
