---
title: "One in eight stored IFC volumes disagrees with the model's geometry"
date: 2026-11-19
tags: [ifc-quantity-takeoff, ventures]
description: "We recomputed 5,495 stored GrossVolumes from the geometry of 8 public IFC models. 690 disagreed, and for 144 the stored figure was provably wrong."
---

An IFC model describes each wall twice. Once as geometry: a profile extruded
to a height, cut by the roof plane, with openings punched through it. And once
as numbers the authoring tool wrote alongside: `GrossVolume`, `NetVolume`,
`NetSideArea`. Estimators take the numbers, because summing a column is easier
than measuring solids. The question is whether the two descriptions agree.

So we built a takeoff that measures the solids too.
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads an
`.ifc` in the browser, groups elements into a bill of quantities, and computes
every element's volume from its body (each solid becomes a signed sum of
convex pieces; clipping planes cut every piece, openings are intersected and
subtracted). Then it compares the result with what the model stored.

## What 8 public models said

On 13 public models from Revit, ArchiCAD, Tekla and others, 8 store volumes.
Across those, the stored `GrossVolume` matched the computed one within 2% for
**4,805 of 5,495 elements (87%)**, and `NetVolume` for 6,133 of 6,366 (96%).
Where they match, they match to about one part in 10^15: same arithmetic, same
numbers.

The 690 that did not match mostly have a cause you can name:

- **325 "gross" volumes are net.** The exporter took the openings out of the
  figure it labels GrossVolume. If your bill deducts openings again, you
  deduct them twice.
- **96 slab volumes are 1,000 times too large.** A 354.72 m3 slab stores
  354,722.9 under a cubic-metre unit: litres, by the look of it.
- **27 wall pieces carry the whole wall.** Revit can export a wall that spans
  three levels as three pieces, and each piece stores the full wall's volume.
  The three pieces of one HHS Office wall each say 11.60 m3; their solids sum
  to 11.61. Sum the stored column and that wall is counted three times.
- **21 volumes contradict the element's own dimensions.** One wall stores
  16.94 m3 next to a stored length, height and width of 8.30 x 3.30 x 0.20 m,
  which is 5.48. The solid is 5.55.

That leaves 221 unexplained, mostly faceted bodies from one model, and
curtain-wall mullions where the stored figure may leave out a cover cap.

## What the tool does with it

For each disagreement the page shows both numbers and the likely cause. Where
the stored figure is provably the wrong one (split pieces, unit slips, figures
that contradict their own dimensions: 144 of the 690) the bill of quantities
uses the computed volume instead, and says so on the line. The sample model on
the page plants a split wall: its bill sums the walls to 8.18 m3, where adding
the stored column would give 11.78.

It is a first version. Areas still come from the stored quantities, NURBS
bodies are reported as not read, and nobody who prices work for a living has
reviewed it yet. The method, the model list and every count are in
[the evaluation](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/stored-vs-computed-2026-11-19.md),
and the code is MIT.
