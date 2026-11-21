---
title: "Which pipes belong to the hot water system? Reading IFC5 systems for an IDS check"
seo_title: "IFC5 systems and port connections in an IDS check"
date: 2026-11-21
tags: [bim, ifc, ifc5, ids, mep, ids-model-check]
description: "IDS Model Check now reads IFC5 system membership, port connections and flow directions. On the public hot water example all three match the STEP twin."
---

A building services IDS often asks one plain question: is every pipe, valve
and tank assigned to a system? In IFC4 that answer lives in
`IfcRelAssignsToGroup`, and an IDS asks for it with
`partOf relation="IFCRELASSIGNSTOGROUP"`.

[IDS Model Check](../../ventures/ids-model-check/README.md) learned to read
IFC5 alpha `.ifcx` files [earlier today](2026-11-21-checking-an-ifc5-model-against-an-ids.md).
That reader built the spatial tree, the property sets, the classifications
and the materials. It skipped systems, so an IFC5 model failed that question
every time, whatever the file said.

IFC5 writes systems as attributes in a `bsi::ifc::system` namespace. A pipe
says `partofsystem: [{ref: <system>}]`. A port says
`connectsto: [{ref: <other port>}]` and `flowdirection: "SOURCE"`. A system
can say `servicesfacility`, meaning which building it serves. The reader
now turns these into what IFC4X3 uses: `IfcRelAssignsToGroup`, one
`IfcRelConnectsPorts` per pair of ports, the port's `FlowDirection`, and
`IfcRelServicesBuildings`. It also stops putting a system into the spatial
tree. In STEP a system is assigned to things. It is not contained in a
storey.

**Checked against the STEP original.** Of buildingSMART's 47 public `.ifcx`
examples, one uses systems: *Domestic Hot Water*, converted from an IFC4X3
file that sits next to it. Both keep the same GlobalIds, so every fact can be
compared object by object
([eval/ifcx-systems-2026-11-21.md](../../ventures/ids-model-check/eval/ifcx-systems-2026-11-21.md)):

| | IFC5 read | holds on STEP |
| --- | --- | --- |
| system members (`partOf` IfcRelAssignsToGroup) | 9 | 9 of 9 |
| port flow directions | 35 | 35 of 35 |
| connected port pairs | 15 | 15 of 15 |

The connection count has a small trap. The STEP file holds 21
`IfcRelConnectsPorts`, but only 15 distinct pairs, because 6 connections are
written in both directions. The IFC5 file writes every connection on both
ports. Counted as unordered pairs, they agree exactly. Across all 8 STEP/IFC5
twins, the reader's `partOf` links now hold on STEP 1,655 times out of
1,657. Nothing else in the comparison moved.

Two gaps are left. The file's `servicesfacility` points at the building, but
the `.ifcx` has no node for the building, so the reader skips that link and
says so. And the ports' predefined type (`PIPE`) and the system's
(`WATERSUPPLY`) are not in the IFC5 class code, so an IDS that asks for them
still fails on `.ifcx`. One example file is a small sample. The next real
test is a system exported by an actual authoring tool.

Try it: drop a `.ifcx` and an IDS on the
[checker page](https://marisstella.app/ids-model-check/). Nothing is uploaded.
