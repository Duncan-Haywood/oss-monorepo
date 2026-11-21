# IFC5 system links read, checked on the Domestic Hot Water twin, 2026-11-21

What was measured: whether `ifcx.mjs` reads the four `bsi::ifc::system::*`
attributes of an IFC5 alpha model into the relationships its STEP twin has,
so an IDS that asks "is this pipe part of a distribution system?"
(`partOf relation="IFCRELASSIGNSTOGROUP"`) means on the `.ifcx` what it
means on the `.ifc`. Follows `eval/ifcx-twins-2026-11-21.md`, whose open
item this was ("IFC5 system links").

## Files

buildingSMART's IFC5 development repository, commit `1a63082`, fetched by
`eval/fetch-ifcx-twins.sh` (not committed). Of its 47 `.ifcx` files only
`Domestic Hot Water/domestic-hot-water.ifcx` uses the system namespace:

| attribute | nodes | STEP twin |
| --- | --- | --- |
| `partofsystem: [{ref}]` | 9 | one IfcRelAssignsToGroup, 9 objects, to IfcDistributionSystem `water_supply` |
| `connectsto: [{ref}]` | 30 (each connection written on both ports) | 21 IfcRelConnectsPorts, 15 distinct port pairs (6 written both ways) |
| `flowdirection` | 35 ports | IfcDistributionPort.FlowDirection on each |
| `servicesfacility: [{ref}]` | 1, on the system | none; it names `e84dc79e-...`, STEP's IfcBuilding `3eJSUU$fr7WPzBLDr3NCgH`, which the `.ifcx` has no node for |

## What changed in the reader

- `partofsystem` -> IfcRelAssignsToGroup (RelatingGroup the system), one per
  system. A reference to something that is not an IfcGroup subtype is left
  out and said.
- `connectsto` -> one IfcRelConnectsPorts per unordered port pair.
- `flowdirection` -> the port's FlowDirection enum, when the class has the
  attribute and the value is in its enumeration.
- `servicesfacility` on a system -> IfcRelServicesBuildings, when the target
  is a classed spatial structure; otherwise said (as on this file).
- A system or other group is not placed in the spatial tree: in STEP an
  IfcSystem is assigned to, not aggregated or contained. (On this file the
  system's parent is unclassed, so nothing moved; a file whose system sits
  under a classed project would have had it aggregated there.)

## Method

`node eval/ifcx-twins.mjs eval/twins/ifc5/examples` (54 s), now also
counting partOf through IfcRelAssignsToGroup, a `flow direction` attribute
claim per port, and port connections compared as unordered GlobalId pairs
(IDS has no facet for connections). Each claim is written as an IDS
requirement on the object's GlobalId and checked on both forms.

## Result

| | before (main `59fc69995`) | this change |
| --- | --- | --- |
| partOf claims, 8 twins (hold on IFC5 / on STEP / stated) | 1,648 / 1,646 / 1,648 | 1,657 / 1,655 / 1,657 (the 9 system members, all hold on STEP) |
| port flow direction (Domestic Hot Water) | not read | 35 / 35 / 35 |
| port connections | 0 in IFC5 | 15 in IFC5, 15 of them in STEP, of 15 distinct STEP pairs |
| class, predefined type, properties, materials, classification | unchanged | unchanged |
| `eval/ifcx-sweep.mjs`, 47 files | 47 read, 0 errors | 47 read, 0 errors; one new note (the servicesfacility target above) |

## Public IDS that ask for it

Of the 65 public IDS files in `eval/corpus/real`, one uses
`partOf relation="IFCRELASSIGNSTOGROUP"`
(`imagemnl__IMAGEM-GeoBIM-IDS__IDS_IBRO_FI_IMAGEM.ids`: IfcZone and IfcGroup
membership). Before this change such a requirement failed on every `.ifcx`
model, whatever it said; now it reads what the file says.

## Not measured

- Only one public `.ifcx` file carries systems; a second authoring tool's
  system export would test the shape (e.g. `partofsystem` on a type node).
- The 32 ports' and the system's predefined types (PIPE, WATERSUPPLY) are
  not in the IFC5 class code, so stay unset; an IDS asking for them fails on
  `.ifcx` (counted in the twins' predefined-type line, 12,017 of 12,116).
