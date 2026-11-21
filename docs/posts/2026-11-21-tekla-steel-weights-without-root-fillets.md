---
title: "Tekla's stored steel weights leave out the root fillets"
seo_title: "Tekla IFC NetVolume and NetWeight: root fillets left out"
date: 2026-11-21
tags: [ifc-quantity-takeoff, ventures, bim, steel]
description: "On a public Tekla IFC, stored NetVolume and NetWeight come from the section without its fillets: an IPE240 5% light. The takeoff now names and corrects it."
---

An IPE240 has a cross-section of 39.1 cm2. That figure includes the four
root fillets, the curved corners where the web meets the flanges. Leave
them out and you get 37.2 cm2, about 5% less steel.

On Tekla's public sample model in the web-ifc test set (`ISSUE_021_Mini
Project.ifc`), the stored `NetVolume` and `NetWeight` of every rolled
section leave them out. An IPE240 beam 8.46 m long stores 0.03143 m3 and
251.5 kg. The geometry in the same file, an `IfcIShapeProfileDef` with a
15 mm root radius, has 0.03307 m3. The same model stores `CrossSectionArea =
0.003911` m2 on another IPE240 part, which is the catalogue area *with*
the fillets. So the file disagrees with itself, and the weight a scheduler
or estimator would read is the low one.

It is not only I sections. On that model:

| Section | Parts | Stored under the geometry by | Why |
|---|---:|---:|---|
| IPE240, IPE300, HEA180 | 8 | 3.6 to 4.9% | no root fillets |
| angles (L65/130/8, L100/100/10, L80/80/8) | 68 | 2.0 to 2.5% | no root fillet |
| round tube 60 x 1 | 22 | 2.6% | drawn as 16-sided polygons |
| round tube 20 x 1 | 20 | 10.0% | drawn as 8-sided polygons |
| square tube 60 x 3 | 2 | 3.5% *over* | corner radii left out |

Each ratio is exact: draw the profile again without its radii, or with
its circles as 8- or 16-gons, and the area ratio matches the stored figure to
four decimals on every unclipped part, at any length.

## What the takeoff does with it

The [IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/) already
compared every stored volume with the volume it computes from the geometry.
These 142 stored figures (120 NetVolumes, 22 GrossVolumes) were "unexplained". Now, for any body swept from one
parametric profile, it draws the simplified sections too. When the stored
figure matches one of them to 0.5%, it names the cause
(`simplified-section`). The bill of quantities then uses the geometry, and
the stored weight is scaled up by the same ratio. A drawn (arbitrary)
profile never gets this explanation, and a stored volume 10% off on the same
angle still shows as unexplained.

## Two more causes from the same pass

- **One stair's total on every piece.** On a Revit school model
  (`ISSUE_068_ARK_NUS_skolebygg.ifc`), all 14 stringers of one stair store
  NetVolume 1.34012 m3. That is the stair's flights, landings and stringers
  added up, to five decimals (railings excluded). A stringer's own volume is
  0.0004 to 0.012 m3. Summed as stored, the model's member volume was 18.16
  m3; with each piece's own geometry it is 11.52 m3.
- **A stored zero.** Six ArchiCAD skylights store NetVolume 0. The bill of
  quantities now counts their 0.18 m3 each instead of nothing.

Across the 13 public models we test on, unexplained NetVolumes fell from 233
to 83. The 81 that matter most are ArchiCAD windows and doors whose stored
"Net Volume" changes from one placement to the next on identical bodies.
Those are the next thing to read. The method and every number are in the
repository: `ventures/ifc-quantity-takeoff/eval/netvolume-causes-2026-11-21.md`.

The effect on this particular model is small (58 kg on 829 t), because the
affected parts are small angles, eyes and pins. On a frame built from rolled
sections, the same habit puts every member 2 to 5% under.

*Estimates from public sample files, not engineering advice. Check
quantities that matter against the drawings and the supplier's section
tables.*
