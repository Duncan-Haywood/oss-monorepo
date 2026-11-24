---
title: "A Revit wall split at a level was counted twice, and a Tekla plate stored its paint area"
seo_title: "A Revit wall split at a level was counted twice in an IFC takeoff"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ventures, bim, revit, tekla]
description: "Two IFC stored-quantity faults traced to the file: a split wall's whole figure on one piece, and a plate's NetArea that is every face of its body."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) builds a
bill of quantities from a BIM model. Each element's stored quantity is checked
against its geometry. When the two disagree, the tool tries to name a cause.
Yesterday a sweep of 15 public models left 3 volumes and 13 areas that the
bill sums but no named cause covers. Two groups were most of them. Both now
have a cause, and one had been hiding a double count.

## Half a wall each

Two concrete walls in the HHS Office construction model stored about twice
the volume of their bodies. Wall #1405 stores 5.2520 m3 but its body is
2.6565 m3. The file holds a second element with the same Tag, an `IfcWall`
stacked on top of it. That element stores no quantities, and its body is
2.5955 m3. The two bodies sum to 5.2520, the stored figure, to four
decimals. The other wall matches the same way: 8.2591 + 8.5823 = 16.8414.

Revit splits a wall at a level and writes the whole wall's quantities on one
piece. The tool already knew a version of this, where every piece repeats the
whole figure. Here only one piece carries it, and the other is exported as a
different class. The new rule, `split-held`, takes the other pieces with the
same Tag and kind of element that store nothing, and checks whether all the
bodies sum to the stored figure.

The rule then caught four more walls in the same model. Their volumes had
already been flagged, but their side areas had passed a check that the whole
wall also passes. So the bill summed the lower piece's whole-wall area and
then added the upper piece's own area as well. **That model's bill counted
129.17 m2 of wall area and 11.18 m3 of concrete twice.** Nothing on the page
showed it, because those rows already had a cause the tool trusted.

## A plate's whole skin

The Tekla model M3D-CON-CD has seven steel plates whose stored area was 2 to
3 times their plan. Adding up every face of each plate's body gives the
stored figure to six digits: 28.2990 m2 on a plate whose plan is 12.88 m2.
So the stored NetArea is both faces plus every edge, the area a painter or
galvaniser prices, not a plan area. The rule is named `whole-surface`, and
the bill sums the plan, as it does for every other plate.

## What is left

13 of the 15 models now have nothing in doubt in their bill. One volume and
six areas remain, all on two models. The method, tables and every row whose
cause changed are in
[the evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/split-held-2026-11-24.md).
Each rule has been seen on one model so far. A second Revit or Tekla export
showing the same pattern would be the next test.
