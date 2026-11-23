---
title: "Same railing, three IFC exports: why 32 lengths went missing, and the prism test that finds them"
seo_title: "Railing Length from IFC geometry: one-member railings"
date: 2026-11-23
tags: [ids-model-check, ventures, bim, ifc]
description: "One Tekla model exported three times: railing lengths read in IFC2X3 and vanished in IFC4. A tube defeated the top-rail reading; a prism test now reads them."
---

A railing gets priced by the metre, so when a model is handed over, someone
asks for `Qto_RailingBaseQuantities.Length` on every railing.
[IDS Model Check](https://marisstella.app/ids-model-check/) can write that
figure into a model that lacks it, measured from each railing's own geometry.
Yesterday's run showed that one public Tekla Structures model, exported as
IFC2X3, IFC4 and IFC4X3, read its railing lengths in the first schema and
not in the other two.

## What the railings were

They are not balustrades. Tekla classes single steel members as railings: 12
upright posts and 2 long rails of 57 mm round tube with a 5 mm wall
(`ROR57*5`), plus one IPE80 handrail and one angle handrail. The IFC2X3
export writes each as an extruded profile. IFC4 writes a tessellation:
16 facets around the tube, and each end as an outer ring plus a hole ring.

The railing reader looks for a top rail and reads the railing's path along
it. It then checks that reading against a second one, the rail's volume over
its cross-section, and offers a figure only when they agree. A tessellated
tube fails the check. A post standing upright has no top rail at all. Cut
across the tube, and the section-finder takes the whole disc, hole included,
so the second reading came out at a third of the length: 0.35 m for a 1.1 m
post, 3.9 m for a 12.2 m rail. The two readings disagreed, so nothing was
written. That was the right call, since it is better to write nothing than a
wrong number.

## The prism test

A railing that is one straight member is a prism. Every face either runs
along one axis or lies flat in one of the two end planes. The new reading
tries each face's direction as that axis and keeps the longest axis that
passes. It writes the body's length along that axis only when the body is at
least ten times longer than it is wide. That rules out a row of balusters
(wider than a tenth of their height together) and a glass panel. It never
uses the end faces' areas, so the hole ring Tekla winds the wrong way does
no harm. It runs only when the top-rail reading has nothing to offer.

## What changed

| Tekla export | railing Lengths within 2%, before | after |
| --- | ---: | ---: |
| IFC2X3 | 14 of 16 | 16 of 16 |
| IFC4 | 0 of 16 | 16 of 16 |
| IFC4X3 | 0 of 16 | 16 of 16 |

Across the 24 public models that contain a railing (827 railings), the 41
whose length can be checked against an exporter's stored figure are
unchanged, one by one. Twelve more get a length in an ArchiCAD model:
single 42 mm bars across window openings, read at their own 0.87, 1.03 and
0.78 m. The method, the before-and-after runs and the cases it turns down are
in the venture's
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/one-member-railings-2026-11-23.md).

The same note corrects an earlier one that called these railings IPE80
beams. The profile names in the file say they are tubes.

What it still cannot read is a handrail drawn as one tube swept along a bent
path. That is neither a top rail nor a prism, and no public export stores a
length for one to check against.
