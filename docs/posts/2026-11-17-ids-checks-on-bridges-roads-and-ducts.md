---
title: "Checking bridges, roads and ducts against an IDS: 348 of 348 results match IfcTester"
seo_title: "IDS checks on IFC 4.3 bridge, road and rail models"
date: 2026-11-17
tags: [bim, ifc, ids, infrastructure, mep, construction]
description: "IDS Model Check against IfcTester on buildingSMART's twelve IFC 4.3 and HVAC sample models: 348 of 348 results identical, plus an IFC2X3 gap."
---

Until today, the claim that [IDS Model Check](https://marisstella.app/ids-model-check/)
"gives the same answers as IfcTester" rested on five building models: walls,
slabs, doors, a Revit house. IFC 4.3 is mostly about infrastructure, though, and
infrastructure models don't look like buildings. A bridge is an `IfcBridge`
built from `IfcBridgePart`s (piers, abutments, decks), a road is an `IfcRoad` of
`IfcRoadPart`s, and a track's sleepers and rails sit in an `IfcRailwayPart` of
type TRACK. Building services add another wrinkle: the type of a duct segment
often lives only on its type object.

## What was run

buildingSMART publishes a "Simple-Scene" set of sample models under CC BY 4.0:
ten in IFC 4.3 (architecture, HVAC, landscaping, structure, bridge, electrical,
plumbing, rail, road and the river landscape around them), plus the HVAC model
in IFC4 and IFC2X3. I wrote a new starter IDS for them,
[`infrastructure-and-mep.ids.xml`](https://marisstella.app/ids-model-check/samples/infrastructure-and-mep.ids.xml),
with 18 specifications. A few examples:

- bridge parts must be a named kind (pier, deck, abutment...), so NOTDEFINED fails;
- beams, columns and footings must sit somewhere under an `IfcBridge`, through any
  chain of containment and aggregation;
- bridge beams must be 1 m to 20 m long, where the model writes 4000 in millimetres;
- track elements and rails must sit in a TRACK railway part;
- duct segments must be RIGIDSEGMENT, a value written only on `IfcDuctSegmentType`.

Then I ran each model against this IDS and the two older starters, once through
this checker and once through IfcOpenShell's IfcTester 0.8.0, and compared each
specification's verdict, how many elements it applied to, and exactly which
elements failed.

## Result

**348 of 348** specification results were identical, element by element. That
covered 70 track elements, 32 bridge members reached through two levels of the
spatial tree, and the millimetre-to-metre conversion: both tools pass the three
beams that give a 4000 mm length and fail the five that give none. Two tools
agreeing can still both be wrong, so I checked the counts against the raw data
with IfcOpenShell as well. The bridge really has 2 NOTDEFINED parts, the road
really has 2 parking bays, and the plumbing model has no classification at all,
which is why all 26 of its services fail the "classified" check.

The only differences were on the **IFC2X3** copy of the HVAC model. IFC2X3 has
no air-terminal or duct-segment occurrence classes, so the model writes generic
`IfcFlowTerminal`s and an `IfcFlowSegment`, typed by `IfcAirTerminalType` and
`IfcDuctSegmentType`. This checker maps those to IFCAIRTERMINAL and
IFCDUCTSEGMENT, as buildingSMART's IFC2X3 mapping table says to. IfcTester finds
nothing to apply the specifications to, and reports them as passing. For someone
checking an older MEP export, "passed, nothing applicable" looks clean when it
isn't: three elements there have no classification.

One more thing came up while writing the IDS. My first draft used an empty
`<classification/>` to mean "any system". IfcTester refused to load the whole
file, because `ids.xsd` requires a system. This checker marked only that
specification invalid, ran the other 17, and suggested writing a `.*` pattern
instead. The sample now does that.

## Limits

These are buildingSMART's own demo models: small, tidy, and all from one
exporter. They widen the classes covered, not the exporters. The next step is a
real IFC 4.3 export from an infrastructure tool, and a Revit MEP model with
systems and ports. The full output and the steps to reproduce it are in
[`eval/infra-mep-crosscheck-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/infra-mep-crosscheck-2026-11-17.md).
A check result reads the model against the IDS. It is not a design review or
professional advice.
