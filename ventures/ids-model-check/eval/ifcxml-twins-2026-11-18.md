# ifcXML twins from a real IFC4 exporter, 2026-11-18

What was measured: whether `ifcxml.mjs` reads a real exporter's IFC4 ifcXML
to the same model as the same exporter's STEP file, and whether the checker
gives the same verdicts on both.

Files: 43 pairs of `X.ifc` and `X.ifcxml` written by one tool for the same
model (fetched by `eval/fetch-ifcxml-twins.sh`, not committed):

- the 41 IFC4 ADD2 TC1 Annex E examples in buildingSMART's
  `Standards-builds` (`IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-e`, commit
  `dcf43f7`). Their STEP files name several applications (Geometry Gym's
  ggRhinoIFC and Grasshopper plug-ins on 21, Constructivity, SDS/2, an "IFC
  text editor", a test application, none on 5). The ifcXML files carry the
  same owner histories but share one writer's layout, which they do not name:
  all 41 use `href` references and comma decimals. They read as one
  conversion of the STEP files for the documentation;
- two from `GeometryGym/GeometryGymIFCExamples` (MIT, commit `e005df6`),
  written by GeometryGymIFC's example programs, STEP marked IFC4X2 and ifcXML
  in the IFC4 ADD2 namespace; these use `href` too, without comma decimals.

No IFC4X3 ifcXML file was found in public (GitHub code search for the IFC4X3
namespace in `.ifcxml` and `.xml` files: 0 results; `Standards-builds` has
none either), so the reader's IFC4X3 path is still unmeasured on a real file.

Method (`node eval/ifcxml-twins.mjs <dirs>`): ids do not map between the two
forms (the XML nests most entities with no id), so every entity is hashed as
its class plus its attribute values, with each reference replaced by the hash
of its target. The two models are then compared as sets of distinct hashes;
entities with a GlobalId are paired by it and compared attribute by attribute;
and the three sample IDS files are checked on both. A STEP entity that
nothing with a GlobalId reaches (an unused direction, a spare unit set) is
counted apart: an ifcXML file is written from its root objects down and has
no place for it.

## Before and after this change

| | reader on main (ec9bf9a) | this change |
| --- | --- | --- |
| IDS verdicts identical (43 pairs x 3 IDS) | 108 of 129 | 129 of 129 |
| pairs identical as graphs | 0 of 43 | 12 of 43 |
| pairs identical once unreachable STEP entities are set aside | 0 | 24 |
| GlobalId-paired attribute values identical | 4,172 of 5,602 | 5,695 of 5,782 |

(The paired count rises because GlobalIds the old reader never saw are now
read; see IsTypedBy below.)

What the 21 different verdicts were, on the reader from main: every `href`
reference became a new, empty copy of its class, so an element that a
relationship points at by `href` was counted twice. On
`construction-scheduling-task` the 4 walls read as 24, and "Walls have a
material" went from pass (4 applicable, 0 failing) to fail (24 applicable, 20
"has no material"); "Storeys belong to a building" and "Slabs carry a
predefined type" failed the same way. On `wall-standard-case` and
`wall-elemented-case` one wall read as two.

## What was wrong, and what changed in `ifcxml.mjs`

1. **`href` references.** Both sources write a reference as
   `<Location xsi:nil="true" href="i1"/>`, not `ref="i1"`. Both are read as
   references now. All 43 ifcXML files use `href`.
2. **Decimal commas.** The Annex E ifcXML files were written in a
   comma-decimal locale: all 41 have them (`Precision="0,0001"`,
   `Coordinates="-260,012578 202,771984 0"`), 14,736 numbers in all. xs:double
   has no such form, so they were strings before. They are read with a point
   now, and the model's notes say how many and give one.
3. **Derived attributes written with a value.**
   `<IfcGeometricRepresentationSubContext CoordinateSpaceDimension="0">`: the
   attribute is derived on the sub-context (STEP writes `*`). The value is
   ignored.
4. **A one-item inverse written as the relationship.**
   `<IsTypedBy GlobalId=".."><RelatingType ../></IsTypedBy>`: IsTypedBy is a
   SET [0:1], and the writer puts the IfcRelDefinesByType's own attributes on
   the inverse's element. It was read as a list of nothing, so the type
   relationship was lost: the reader from main read 26 fewer IfcRelDefinesByType than the STEP files hold, in 19 pairs; now 0.
5. **An attribute element whose children are the class's own attributes.**
   `<Position><Location href="i3"/><Axis href="i4"/></Position>` is an
   IfcAxis2Placement3D. Because the first child was a reference, it was read
   as the point itself.
6. **Lists of lists.** `CoordList="0 0 0 1 0 0"` (IfcCartesianPointList3D),
   `CoordIndex`, `Normals`, `TexCoordsList`, `ColourList` are LIST OF LIST
   with a fixed inner size, written flat. `schema/gen-schema.mjs` now keeps
   each inner level's fixed size (`inner`, 11 attributes in IFC4, 12 in
   IFC4X3, none in IFC2X3; the regenerated JSON is otherwise byte-identical),
   and the reader cuts flat lists into rows. A list of rows written one
   wrapper per row (`<Seq-IfcPositiveInteger-wrapper>14 16 15 13</..>`) is
   read as rows.
7. **An attribute name in the wrong case.** `BenchMark="equalto"` on
   IfcMetric (schema: `Benchmark`). Read, and named in the model's notes.

None of these change xBIM's files: `node eval/ifcxml-xbim.mjs` prints the
same table as `eval/ifcxml-xbim-2026-11-16.md`, line for line.

## What still differs, and whose it is

The remaining 87 attribute differences and the root STEP-only entities
(`node eval/ifcxml-twins.mjs` prints them by class) were each traced to the
files, not the reader:

- the ifcXML side is a different export from the STEP side in places: other
  GlobalIds for the same members, openings and materials
  (`wall-elemented-case`, `slab-openings`; IfcRelAssociatesMaterial's
  RelatingMaterial is most of the 87), an IfcOrganization named
  "buildingSMART" in one and "AEC3" in the other;
- values the ifcXML writer drops: IfcMaterialProfile.Priority `0`,
  IfcFootingType.PredefinedType `.PAD_FOOTING.`, IfcPerson.FamilyName,
  an IfcProjectLibrary; and IfcMaterialLayer.IsVentilated `.U.` written as
  `false` (IfcLogical has `unknown`);
- STEP files written against an older IFC4 draft: a fifth argument on
  IfcCircleProfileDef (`CHS219.1x6.3` with a wall thickness, i.e. an
  IfcCircleHollowProfileDef) and a list of lists in
  IfcTriangulatedFaceSet.PnIndex (the pre-ADD2 NormalIndex);
- IfcBSplineSurface.ControlPointsList, a LIST [2:?] OF LIST [2:?] of points,
  written as one flat list of points: the row length is not in the XML
  attribute, so it is left flat (6 surfaces in `basin-advanced-brep` and
  `cube-advanced-brep`). No IDS facet reads it.

Command output, as printed (exit 0):

```
43 pairs; 12 identical as graphs with identical verdicts; 24 identical once 94 STEP entities nothing rooted points at are set aside; GlobalId-paired attribute values 5695 identical, 87 different; IDS verdicts 129 of 129 identical
differences by attribute: IFCRELASSOCIATESMATERIAL.RelatingMaterial 23, IFCRELDEFINESBYTYPE.RelatedObjects 7, IFCRELDECLARES.RelatedDefinitions 5, IFCRELCONTAINEDINSPATIALSTRUCTURE.RelatedElements 4, IFCRELASSOCIATESMATERIAL.RelatedObjects 4, IFCFOOTINGTYPE.PredefinedType 4, IFCRELAGGREGATES.RelatingObject 3, IFCRELDECLARES.RelatingContext 3, IFCBOILERTYPE.RepresentationMaps 3, IFCRELASSOCIATESCONSTRAINT.RelatedObjects 3, IFCPROJECT.OwnerHistory 2, IFCRELVOIDSELEMENT.RelatedOpeningElement 2, IFCSANITARYTERMINALTYPE.RepresentationMaps 1, IFCRELDEFINESBYTYPE.RelatingType 1, IFCSANITARYTERMINAL.Representation 1, IFCBEAM.Representation 1, IFCBUILDINGELEMENTPROXY.Representation 1, IFCWALL.Representation 1, IFCRELVOIDSELEMENT.RelatingBuildingElement 1, IFCBUILDING.OwnerHistory 1, IFCRELAGGREGATES.OwnerHistory 1, IFCRELAGGREGATES.RelatedObjects 1, IFCSTRUCTURALANALYSISMODEL.OwnerHistory 1, IFCRELSERVICESBUILDINGS.OwnerHistory 1, IFCRELSERVICESBUILDINGS.RelatingSystem 1, IFCRELSERVICESBUILDINGS.RelatedBuildings 1, IFCSTRUCTURALSURFACEMEMBER.OwnerHistory 1, IFCSTRUCTURALSURFACEMEMBER.Representation 1, IFCSTRUCTURALSURFACEMEMBER.PredefinedType 1, IFCSTRUCTURALSURFACEMEMBER.Thickness 1, IFCRELASSIGNSTOGROUP.OwnerHistory 1, IFCRELASSIGNSTOGROUP.RelatedObjects 1, IFCRELASSIGNSTOGROUP.RelatingGroup 1, IFCRELASSOCIATESMATERIAL.OwnerHistory 1, IFCRELASSIGNSTOPRODUCT.RelatedObjects 1, IFCRELASSIGNSTOPRODUCT.RelatingProduct 1

root differences (STEP-only entities reachable from a rooted object whose references all match), by class:
- IFCBSPLINESURFACEWITHKNOTS 6: e.g. basin-advanced-brep #548 [3,3,[[{"ref":549},{"ref":550},{"ref":551},{"ref":552},{"ref":549},{"ref":550},{"ref":551}],[{"ref":553},{"ref":554},{"ref":555},{"ref":556},{"ref":553},{"ref":
- IFCMATERIALPROFILE 6: e.g. beam-revolved-solid #64 ["IPE600",null,{"ref":61},{"ref":91},0,null]
- IFCMATERIALLAYER 4: e.g. slab-openings #202 [{"ref":200},200,{"unknown":true},"Core",null,null,null]
- IFCRELDEFINESBYTYPE 4: e.g. wall-elemented-case #64 ["0Rs3H_63TAwQ71vL6XMwkm",null,null,null,[{"ref":128},{"ref":129},{"ref":130}],{"ref":45}]
- IFCFOOTINGTYPE 4: e.g. ParametricFooting #16 ["36UcYCIVjAfvbyIqs$Nuyh",null,"PadFootingParametric",null,null,[{"ref":30}],[{"ref":29}],null,null,{"enum":"PAD_FOOTING"}]
- IFCTRIANGULATEDFACESET 3: e.g. tessellation-with-blob-texture #48 [{"ref":49},[[0,0,-1],[0,0,1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],[0,0
- IFCRELVOIDSELEMENT 2: e.g. slab-openings #328 ["0gqEDsyEzFXvY$fc_rUxyO",{"ref":56},null,null,{"ref":303},{"ref":325}]
- IFCORGANIZATION 1: e.g. beam-standard-case #100002 [null,"buildingSMART",null,null,null]
- IFCCIRCLEPROFILEDEF 1: e.g. beam-varying-profiles #300 [{"enum":"AREA"},"CHS219.1x6.3",null,109.55,6.3]
- IFCPROJECTLIBRARY 1: e.g. wall-with-opening-and-window #110 ["1SutvPaeH8EBtxrmG2k_Kh",{"ref":2},null,null,null,null,null,null,null]
- IFCPERSON 1: e.g. surfaceMember #15 ["Jon","Jon",null,null,null,null,null,null]
- IFCDIRECTION 1: e.g. surfaceMember #35 [[0,-1,0]]
```

Per-pair table:

| pair 
| --- 
| air-terminal-element 
| air-terminal-library-object 
| basin-advanced-brep 
| basin-faceted-brep 
| basin-tessellation 
| bath-csg-solid 
| beam-curved-i-shape-tessellated 
| beam-extruded-solid 
| beam-revolved-solid 
| beam-standard-case 
| beam-straight-i-shape-tessellated 
| beam-varying-cardinal-points 
| beam-varying-extrusion-paths 
| beam-varying-profiles 
| brep-model 
| column-extruded-solid 
| column-straight-rectangle-tessellation 
| construction-scheduling-task 
| csg-primitive 
| cube-advanced-brep 
| extruded-solid 
| grid-placement 
| mapped-shape-with-multiple-items 
| mapped-shape-with-transformation 
| mapped-shape-without-transformation 
| polygonal-face-tessellation 
| reinforcing-assembly 
| reinforcing-stirrup 
| slab-openings 
| slab-standard-case 
| slab-tessellated-unique-vertices 
| structural-curve-member 
| surface-model 
| tessellated-item 
| tessellation-with-blob-texture 
| tessellation-with-image-texture 
| tessellation-with-individual-colors 
| tessellation-with-pixel-texture 
| wall-elemented-case 
| wall-standard-case 
| wall-with-opening-and-window 
| surfaceMember 
| ParametricFooting 
