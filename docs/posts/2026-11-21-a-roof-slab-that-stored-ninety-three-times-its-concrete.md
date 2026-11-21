---
title: "A roof slab that stored 93 times its concrete: two IFC export habits named"
seo_title: "IFC GrossVolume 93 times too large: litres over square feet"
date: 2026-11-21
tags: [ifc-quantity-takeoff, ventures, bim]
description: "On public IFC models, 20 Revit slabs stored litres divided by 10.7639 as m3. Our free takeoff now names that and 105 ArchiCAD walls exported net."
---

An IFC model carries two descriptions of every wall and slab: the geometry,
and the quantities the authoring tool wrote beside it (`GrossVolume`,
`NetVolume` and so on). Estimators usually sum the stored figures. The free
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) computes
the volume from the geometry as well and says, element by element, when the two
disagree and why.

On the 13 public models we test against, 159 stored GrossVolumes disagreed
with the geometry and the tool had no reason to give. Today it names a cause
for 125 of them. Two export habits cover them.

## Litres, then divided by square feet

A school model exported from Revit (`ISSUE_068_ARK_NUS_skolebygg` in the
web-ifc test files) has a concrete roof slab, #67904, whose geometry holds
225.09 m3. Its stored GrossVolume is 20,911.71. The ratio is 92.903, and
92.903 is 1000 / 10.7639: a volume in litres (the same model writes 96 other
slabs 1,000 times too large), then divided by the square-metre-to-square-foot
factor. Twenty of the model's slabs sit on that ratio to within 0.001%.

The takeoff already knew both halves separately. It did not try the product,
because a wider list of "unit slip" factors catches random ratios too: at a
0.5% tolerance, 36 such factors would match about one ratio in a hundred by
chance. So the combined factor is tried last, only on rows nothing else
explains, and counts only when at least three elements in the model share
it. A slab that happens to be 92.9 times off on its own stays unexplained.

This one mattered for the money. Those slabs store no NetVolume, so a bill
of quantities summed the stored gross. The model's slabs came to 134,776 m3
before and 11,086 m3 now: the 20 slabs count the 1,346 m3 in their geometry,
not the 125,036 m3 written beside it. Nothing about the model looks wrong
in a viewer.

## Walls exported with their windows already cut

In schependomlaan, an ArchiCAD house, 91 walls and 14 slabs computed 15 to
78% under their stored GrossVolume. Wall #27645 is typical: the geometry
gives 1.3573 m3, the stored GrossVolume is 1.8219, and the stored NetVolume is
1.3573. The exporter wrote each wall as a mesh with the window holes in it
and no separate opening elements, so the geometry is the net volume. The
exporter's own figures confirm it: gross side area minus net side area,
times the 214 mm thickness, is 0.4646 m3, exactly the gap. That held on 104
of the 105 to the printed precision, and the last was within 0.9%.

Here the stored figure is right and the bill of quantities was already
right, since it sums the stored net. What changes is that 105 warnings a user
would have had to chase in a viewer now say what they are.

## What is left

34 GrossVolumes stay unexplained: 22 small Tekla parts whose stored volume
is Tekla's own faceted approximation, 7 walls whose openings are curved
solids the tool cannot subtract yet, two HHS walls storing about twice their
body, and three others. Both causes above are each one exporter's habit, seen
on one model; the method and every number are in
[the evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/stored-vs-computed-2026-11-21.md).

The takeoff runs in the browser; the model never leaves your machine. Its
results are estimates to check, not professional advice.
