# IFC 4.3 infrastructure and MEP models through the IfcTester cross-check (2026-11-17)

**Question.** The README's "same answers as IfcTester" rested on five building
models (architecture, one Revit house, an ADU). Does it hold on IFC 4.3
infrastructure (bridges, roads, rail, earthworks) and building services
(ducts, air terminals, pipes), where the classes, the spatial tree
(`IfcBridge` > `IfcBridgePart`, `IfcRoad` > `IfcRoadPart`,
`IfcRailway` > `IfcRailwayPart`) and the type objects are different?

**Models.** buildingSMART's Simple-Scene set, `Sample-Test-Files` commit
`80d976a` (CC BY 4.0; `eval/fetch-bsi-simple-scene.sh` fetches it; three
are committed in `samples/bsi-ifc43/`): all ten `IFC 4.3.2.0 (IFC 4.3
ADD2)/Simple-Scene/` models (Building-Architecture, -Hvac, -Landscaping,
-Structural; Infra-Bridge, -Electrical, -Landscaping, -Plumbing, -Rail, -Road;
111 KB to 2.3 MB, all in millimetres), plus Building-Hvac in IFC4 and IFC2X3.

**IDS.** The two existing starters, and a new one written for these models,
`samples/infrastructure-and-mep.ids.xml` (18 specifications): predefined
types on bridges, bridge parts, road parts, earthworks, signs, ducts and pipes
(several only on the type object); `partOf` through containment and
aggregation to `IfcBridge`, `IfcBuilding`, `IfcRailwayPart` of type
TRACK, and an enumeration of two parent classes; quantities in mm compared in
metres (`Qto_BeamBaseQuantities.Length`, a project set's `SizeSet.Height`
of 167 mm); a `Name` pattern in applicability; material name patterns;
classification by system. It audits VALID (18 of 18) and IfcTester's
`ids.xsd` load accepts it.

**Tools.** IfcTester 0.8.0 with IfcOpenShell 0.8.5 (the pair that runs;
`eval/untyped-values-2026-11-17.md`), and this checker's `cli.mjs --json`,
through `eval/crosscheck_ifctester.py`.

## Result

| IDS | models | specification results | identical |
| --- | --- | --- | --- |
| infrastructure-and-mep (new) | 10 IFC 4.3 | 180 | **180** |
| coordination-basics | 10 IFC 4.3 + 2 HVAC (IFC4, IFC2X3) | 84 | **84** |
| quantities-and-naming | 10 IFC 4.3 + 2 HVAC (IFC4, IFC2X3) | 84 | **84** |
| infrastructure-and-mep (new) | HVAC in IFC4 and IFC2X3 | 36 | 33 (the 3 differences: below) |

"Identical" means the same verdict, the same applicable count and the same set
of failing element ids. 348 of 348 results match element by element (all but
the new IDS on the IFC2X3 copy), including 70 track elements, 32 bridge members
reached through two levels of the spatial tree, and the unit conversion (both
pass the three 4000 mm beams as 4 m and fail the five that carry no length).

The verdicts were then checked against the data itself with IfcOpenShell
rather than taken from the two tools agreeing: Infra-Bridge has 2
`IfcBridgePart`s of NOTDEFINED (the 2 failures), 3 of its 8 beams carry
`Length` 4000.0 (5 failures), Infra-Road has 2 PARKINGBAY parts (2
failures), 48 of 76 geographic elements carry `SizeSet.Height` (48
applicable), and Infra-Plumbing has no classification at all (26 failures).

**The 3 differences** are on IFC2X3 Building-Hvac, and they are about IFC2X3
classes, not about the IDS. IFC2X3 has no \`IfcAirTerminal\` or
\`IfcDuctSegment\` occurrence class: the model writes 2 \`IfcFlowTerminal\`s
typed by \`IfcAirTerminalType\` and 1 \`IfcFlowSegment\` typed by
\`IfcDuctSegmentType\`. This checker resolves those through buildingSMART's
IFC2X3 type mapping table (README, "Which IFC versions work"), so the three
specifications naming IFCAIRTERMINAL and IFCDUCTSEGMENT apply to 1, 2 and 3
elements; IfcTester 0.8.0 applies them to none. The cause was confirmed by
re-running with every specification's \`ifcVersion\` widened to
"IFC2X3 IFC4 IFC4X3_ADD2" (the same 3 differences, nothing else changed), so
the \`ifcVersion\` mismatch, where this checker runs the specification and
warns, is not what IfcTester differs on. A coordinator checking an IFC2X3
MEP export with IfcTester would see these specifications pass with nothing
applicable, which reads as clean.

**Found on the way.** The first draft of the IDS had an empty
`<classification/>` as "any system". IfcTester's loader refused the whole
file (`ids.xsd`: `system` is required); this checker marked that one
specification INVALID and ran the other 17, with the hint to write a pattern
such as `.*`. The sample now does.

## Limits

These are buildingSMART's own demonstration models: small (under 2.5 MB),
tidy, and written by one exporter. They widen the classes and spatial trees
covered, not the exporters; a real infrastructure authoring tool's IFC 4.3
export (Civil 3D, OpenRoads, Allplan Bridge) is the next model to try, and the
MEP side still lacks a real Revit MEP export with systems and ports.

## Reproduce

```
pip install ifcopenshell==0.8.5 ifctester==0.8.0
sh eval/fetch-bsi-simple-scene.sh
python3 eval/crosscheck_ifctester.py samples/infrastructure-and-mep.ids.xml "eval/bsi-samples/IFC 4.3.2.0 (IFC 4.3 ADD2)/Simple-Scene/"*.ifc
node --test infra.test.mjs
```

## Output (infrastructure-and-mep, the ten IFC 4.3 models)

```
== Building-Architecture.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (1 applicable, 0 failing) | ours pass (1 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Building-Hvac.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (1 applicable, 0 failing) | ours pass (1 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (2 applicable, 0 failing) | ours pass (2 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester fail (3 applicable, 3 failing) | ours fail (3 applicable, 3 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Building-Landscaping.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Building-Structural.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester fail (7 applicable, 7 failing) | ours fail (7 applicable, 7 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Infra-Bridge.ifc: IfcTester 0.1 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (3 applicable, 0 failing) | ours pass (3 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester fail (18 applicable, 2 failing) | ours fail (18 applicable, 2 failing)
  same  Structural members belong to a bridge: IfcTester pass (32 applicable, 0 failing) | ours pass (32 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester fail (8 applicable, 5 failing) | ours fail (8 applicable, 5 failing)
  same  Bridge slabs give a net volume: IfcTester pass (3 applicable, 0 failing) | ours pass (3 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (4 applicable, 0 failing) | ours pass (4 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (4 applicable, 0 failing) | ours pass (4 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Infra-Electrical.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (3 applicable, 0 failing) | ours pass (3 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester fail (1 applicable, 1 failing) | ours fail (1 applicable, 1 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester fail (3 applicable, 3 failing) | ours fail (3 applicable, 3 failing)
  same  Every road is classified: IfcTester pass (5 applicable, 0 failing) | ours pass (5 applicable, 0 failing)
== Infra-Landscaping.ifc: IfcTester 0.1 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester fail (10 applicable, 10 failing) | ours fail (10 applicable, 10 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (48 applicable, 0 failing) | ours pass (48 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (10 applicable, 0 failing) | ours pass (10 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Infra-Plumbing.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (3 applicable, 0 failing) | ours pass (3 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (24 applicable, 0 failing) | ours pass (24 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester fail (26 applicable, 26 failing) | ours fail (26 applicable, 26 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Infra-Rail.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Courses sit in a road or railway part: IfcTester pass (2 applicable, 0 failing) | ours pass (2 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (70 applicable, 0 failing) | ours pass (70 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester fail (0 applicable, 0 failing) | ours fail (0 applicable, 0 failing)
== Infra-Road.ifc: IfcTester 0.0 s, ids-model-check 0.1 s (wall clock, including start-up)
  same  Bridges are arched or girder bridges: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge parts say what they are: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Structural members belong to a bridge: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Beams in a bridge are 1 m to 20 m long: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Bridge slabs give a net volume: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Earthworks fill is typed: IfcTester pass (16 applicable, 0 failing) | ours pass (16 applicable, 0 failing)
  same  Road parts are carriageway, shoulder or segment: IfcTester fail (26 applicable, 2 failing) | ours fail (26 applicable, 2 failing)
  same  Courses sit in a road or railway part: IfcTester pass (16 applicable, 0 failing) | ours pass (16 applicable, 0 failing)
  same  Asphalt courses are bitumen: IfcTester pass (16 applicable, 0 failing) | ours pass (16 applicable, 0 failing)
  same  Track elements sit in a track: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Line markings are named and painted: IfcTester pass (20 applicable, 0 failing) | ours pass (20 applicable, 0 failing)
  same  Trees and plants are under 20 m tall: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Signs are pictorial and have a material: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Duct segments are rigid and sit on a storey: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Air terminals have a material and sit in a building: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Pipe segments are culverts or rigid pipes: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Services and chambers are classified in CCI: IfcTester pass (0 applicable, 0 failing) | ours pass (0 applicable, 0 failing)
  same  Every road is classified: IfcTester pass (5 applicable, 0 failing) | ours pass (5 applicable, 0 failing)
```
