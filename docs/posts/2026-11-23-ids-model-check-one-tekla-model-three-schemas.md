---
title: "One Tekla model, three IFC schemas, two answers: Tekla's net volume has no fillets"
seo_title: "Why Tekla IFC2X3 and IFC4 exports give different beam volumes"
date: 2026-11-23
tags: [ids-model-check, ventures, bim]
description: "The same Tekla beams measured 5.9% apart in IFC2X3 and IFC4. Tekla's NetVolume leaves out the root fillets; the free IDS checker now does too."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) can fill in
missing `Qto_` quantities by measuring each element's geometry. One public
test model lets us check that against itself. A Tekla Structures 2026 model
was exported three times, as IFC2X3, IFC4 and IFC4X3. Same beams, same
walls, three files.

The measurements should have agreed, and they didn't. In the IFC4 file, 150
of 151 measured values were within 2% of what Tekla stored. In the IFC2X3
file only 51 of 68 beam volumes were. Matching every element across the three
files by its GlobalId turned up 53 values that agreed in one schema and not
in another.

## The beams: where did 5.9% go?

The worst case was a 5 m HEA300 pile. In IFC2X3 its body is the standard
parametric I-section, with the 27 mm radius where web meets flange. In IFC4,
Tekla writes the same pile as a 24-point mesh, and the mesh has square
corners.

- With the fillets: 11,253 mm² x 5 m = **0.05626 m³**
- Without them: 10,627 mm² x 5 m = **0.05314 m³**

Tekla's own `Quantities` set on the pile holds both. `GrossVolume` is
0.05625, the catalogue section. `NetVolume` is 0.05314, the modelled solid,
which has no fillets. So the IFC2X3 measurement was the true steel volume,
and Tekla's NetVolume was the other figure. Neither was a bug. Together
they meant a NetVolume we filled into a Tekla model would come out 5 to 6%
above the ones Tekla wrote for the beams beside it.

The fix follows Tekla's convention, for Tekla models only. When a Tekla
column, beam, member or pile is a single extrusion of a parametric section,
the NetVolume we offer leaves out the fillets. GrossVolume keeps them.

We checked it on Tekla exports from the
[web-ifc test set](https://github.com/ThatOpen/engine_web-ifc), which played
no part in finding the rule. The rule changes 109 members that also store a
NetVolume. All 109 now match the stored figure, against 37 before (the 37
were sections whose fillets are under 2% of the area). It made no match worse.

## The walls: lying on their side

The second cause had nothing to do with steel. Tekla's IFC4 export draws a
wall as a box in a frame whose own y axis points up, with no axis line. The
checker read a wall's length and height only when its own z pointed up, so
these walls got no reading at all.

Now such a wall is turned upright before it's measured. That only happens
when the wall runs along its own x, which is how Tekla draws one. The rule
was first written without that condition, and the corpus check caught it.
Another Tekla model has four 1.45 x 1.5 x 3 m concrete piers that stand on
their own x. Tekla stores their "Length" as the 3 m upright side, which goes
against the standard's definition, so those are left for a person. Across
all 40 public files, 37 walls get turned. All 74 of their stored lengths and
heights match.

## Where that leaves Tekla models

Across the four public Tekla exports, 649 of 657 measured values are now
within 2% of what Tekla stored, up from 551 of 583. That counts values filled
into Tekla's own `Qto_` property sets. One gap is left: 14 single IPE80
members that Tekla classes as railings get no reading in IFC4. The railing
reader looks for a top rail, and a single member doesn't have one.

The method and every count are in
[`eval/beam-schema-twins-2026-11-23.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/beam-schema-twins-2026-11-23.md).
The checker is free, runs in your browser, and the model never leaves your
machine.
