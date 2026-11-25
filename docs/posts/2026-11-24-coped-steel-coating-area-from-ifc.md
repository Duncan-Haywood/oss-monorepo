---
title: "Coped steel beams in IFC: a paint area checked three ways, and where IfcOpenShell's cut goes wrong"
seo_title: "Coped steel beam paint area from IFC, checked three ways"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, bim, structural-steel, estimating, ventures]
description: "The free IFC takeoff now measures coped steel members' paint area from their cut faces: 825 of 825 parts on 8 public models, checked three ways."
---

This morning the [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/)
gained a coating column: the painted, galvanised or fire-protected area of
every steel part. It left 28 parts blank. They were the coped members in a
public Revit model, beams and columns whose ends Revit models as a steel
section with faceted solids subtracted from it. Those 28 now have a figure,
and so do all 825 steel parts on the 8 public models with steel.

## The trap in the obvious method

The geometry engine holds a cut body as a signed sum of convex pieces. To get
its surface you add up each plane's faces and let the faces that two pieces
share cancel. The usual way to do that keeps one area vector per plane.

A cope breaks it. When the cut is flush with the underside of a flange, the
flange's underside faces down and the strip of web the cope exposes faces up,
both on the same plane. One vector per plane subtracts one from the other.
On one beam that lost 0.0072 m2. On another it went the other way: the
cut-outs sit about a thousandth of a millimetre off the flange planes, so
faces that should have cancelled didn't, and the figure came out 0.09 m2 high.

The new routine treats each plane's faces as a winding count and integrates
its absolute value in exact slabs. Shared faces cancel, and an up face and a
down face on one plane both count. Planes that are a hair apart are grouped,
but whole groups are joined and never split. Splitting doubled the area of a
filleted I section, whose root radii are built from a fan of nearly parallel
pieces.

## Three checks

- **IfcOpenShell 0.9.** On the 11 coped parts whose volume it agrees with,
  the areas agree to 1e-5 m2.
- **A Monte Carlo volume.** On the other 17, IfcOpenShell's own cut is off:
  9 come out uncut and 8 lose too much steel (0.011622 m3 where the count
  gives 0.012349 ± 0.000085, and we give 0.012345).
- **A Crofton line count.** Random lines cross a surface a number of times
  proportional to its area. On every distinct body it agrees with ours within
  1.4 standard errors.

Members clipped at their ends now take their real faces too. Before, the
column scaled the profile's sides by volume, which assumes square cuts. On
three short, skew-cut beams IfcOpenShell agrees with the new figures, and a
Tekla deck beam now matches the area Tekla stores to five decimals.

## What's still open

Two notched angles on a Tekla model read about 1% high, because our volume
of those bodies is about 1% high. The coating figure is still nearer than the
uncut skin Tekla stores for them. That volume is the next thing to fix.
Everything above, with the scripts, is in
`ventures/ifc-quantity-takeoff/eval/coped-coating-2026-11-24.md`.

The model is read in your browser and nothing is uploaded. Quantities are only
as good as the model, so check them against the drawings and your
specification before you price them.
