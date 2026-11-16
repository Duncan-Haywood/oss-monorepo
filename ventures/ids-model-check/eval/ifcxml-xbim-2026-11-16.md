# ifcXML and .ifczip on xBIM's test files, 2026-11-16

What was measured: whether the new readers (`ifcxml.mjs`, `zip.mjs`) read real
ifcXML and ifcZIP files, and whether an ifcXML model reads to the same entities
as the STEP file it was exported from.

Files: every `*.ifcxml` and `*.ifczip` in `Tests/TestFiles` and
`Tests/TestSourceFiles` of xBIM's XbimEssentials at commit
`e3c877712aeff39813219b9dd13383c266d07055` (CDDL; fetched by
`eval/fetch-xbim-samples.sh`, not committed). Command:
`node eval/ifcxml-xbim.mjs` (exit 0). Output as printed:

| file | form | schema | entities | reader notes | zip entry vs unzip -p |
| --- | --- | --- | --- | --- | --- |
| TestFiles/4walls1floorSite.ifcxml | ifcXML | IFC2X3 | 579 | none |  |
| TestFiles/4walls1floorSite.ifczip | STEP | IFC2X3 | 524 | none | 4walls1floorSite.ifc: identical |
| TestFiles/Dimensions.ifcxml | ifcXML | IFC4 | 21 | none |  |
| TestFiles/HelloWallXml.ifczip | ifcXML | IFC2X3 | 163 | none | Hellowall.ifcxml: identical |
| TestFiles/Ifc4WithNestedLists.ifczip | STEP | IFC4 | 31713 | none | ASH_ArmitageShanks_DocMPacks_CCLeftHandPack_S6966-_-IFC4DTV.ifc: identical |
| TestFiles/IkeaKitchenCabinets.ifcXML | ifcXML | IFC4 | 153 | none |  |
| TestFiles/ImplicitPropertyTyping.ifcxml | ifcXML | IFC4 | 39 | none |  |
| TestFiles/InvalidNan.ifcxml | ifcXML | IFC2X3 | 468 | none |  |
| TestFiles/QuantityTest.ifcxml | ifcXML | IFC4 | 7 | none |  |
| TestFiles/RefWithContent.ifcXML | ifcXML | IFC4 | 9 | ref="id02" points at no element |  |
| TestFiles/SmallModelIfc2x3.ifczip | STEP | IFC2X3 | 579 | none | SmallModelIfc2x3.ifc: identical |
| TestFiles/SmallModelIfc4.ifczip | STEP | IFC4 | 52 | none | SmallModelIfc4.ifc: identical |
| TestSourceFiles/4walls1floorSite.ifcxml | ifcXML | IFC2X3 | 579 | none |  |
| TestSourceFiles/HelloWallXml.ifczip | ifcXML | IFC2X3 | 163 | none | Hellowall.ifcxml: identical |
| TestSourceFiles/IfcDerivedUnit.ifcxml | ifcXML | IFC4 | 7 | none |  |
| TestSourceFiles/TestZip.ifczip | STEP | IFC2X3 | 579 | none | 4walls1floorSite.ifc: identical |

4walls1floorSite: 579 STEP entities, 579 ifcXML; 0 missing or retyped; attribute values 2205 identical, 0 different
coordination-basics.ids.xml verdicts on the two: identical

How to read it:

- "reader notes" are the reader's own errors. The one note is true of the
  file: `RefWithContent.ifcXML` refers to `id02`, which it never defines (it is
  xBIM's test for that case).
- The zip column compares each entry, as read by `zip.mjs` and inflated by
  `node:zlib`, with `unzip -p` (Info-ZIP). `TestZip.ifczip` writes its sizes as
  0xFFFFFFFF with the real ones in a zip64 extra field, as .NET does; the first
  version of `zip.mjs` refused it, and zip64 sizes and offsets were added.
- The pair: `4walls1floorSite.ifc` (Revit 2014 export) and
  `4walls1floorSite.ifcxml` (xBIM's ifcXML of the same model, ids `iN` for
  `#N`). Every attribute of every entity was compared after mapping references:
  2,205 of 2,205 identical. The starter IDS gives the same verdicts on both.
- Entity counts of the other files cannot be checked against a STEP twin; they
  show the files read to whole models, not that every attribute is right.
  Two counts rose while the reader was being written (Ikea 110 to 153,
  RefWithContent 7 to 9) when attribute elements that are themselves an
  instance (`<Enumerators Name="Value">`, an implicit IfcPropertyEnumeration)
  stopped being dropped.

Not shown: an IFC4 ifcXML file with a STEP twin from a real exporter (none was
found in public; the IFC4 twin used in the tests is `samples/tiny-house.ifcxml`,
written here by hand: 319 of 319 values identical), and IFC4X3 ifcXML, which
was not found at all; the reader picks IFC4X3 from the namespace but no real
file has been through it.
