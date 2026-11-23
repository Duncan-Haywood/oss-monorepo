---
title: "When the reference is wrong: counting a geometry kernel's inside-out faces"
seo_title: "IFC brep volumes: IfcOpenShell meshes with inside-out faces"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "Checking every IfcOpenShell brep mesh for faces turned the wrong way cut the unexplained volume disagreements on two public IFC models from 15 to 5."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads
the volume of every solid in a building model. To check that reading, it
compares against IfcOpenShell, an independent open-source geometry kernel.
When the two disagree, the comparison script tries to say why. Until today
one of its answers was "unexplained", and on two public models
(kleine_Wohnung and FM_ARC_DigitalHub, from the web-ifc test files) that
answer covered 15 solids.

Yesterday's run traced five of them by hand. IfcOpenShell had meshed those
solids correctly, point for point, but some of its triangles faced inward. A
closed mesh's volume comes from summing signed triangles, so a patch turned
inside out is subtracted where it should be added. Turned back to agree with
their neighbours, the same triangles enclosed this tool's figure to within
0.3%.

That check lived in a one-off script that took brep ids typed in by hand. Now
the reference script runs it on every mesh it writes. It welds the vertices
and counts directed edges. When an edge has no partner running the other way,
it turns the triangles breadth-first until they agree, then records the
corrected volume next to the raw one. The comparison reads both and has a new
reason to report: "IfcOpenShell's faces turned".

## What it explained

- **Unexplained: 15 to 5.** These ten solids are now named: the five traced
  yesterday and five more on FM_ARC_DigitalHub. One pair read 0.0246 m3 raw
  in IfcOpenShell, against 0.00404 here and 0.00404 turned.
- **The five left are not this.** Every edge in their meshes pairs up. They
  are B-spline and revolved surfaces that read 0.17 to 0.29% light, about
  what an inscribed mesh loses, just past the 0.1% line.
- **The "bigger than its box" figures are this too.** The script already
  set aside IfcOpenShell volumes larger than the solid's bounding box, since
  no solid can be. Turned, 55 of those 56 match this tool within 0.5%, most
  to five significant figures (0.43922 m3 raw, 0.014616 turned, 0.014616
  here).

## A trap on the way

The first version checked the turned figure before checking for shells made
of overlapping pieces. It then "explained" a brep reading 0.328 m3 inside a
0.254 m3 box. The turned figure counts each piece the right way out and adds
them up, which is exactly how this tool counts them. Both sides double-count
the overlap, so their agreement explains nothing. The overlap test now comes
first, and the report still says how many of those shells the turned figure
matches, so the information is kept without the false credit.

## Why it matters for a takeoff

A quantity check is only as good as its reference. If the reference
quietly subtracts some of its own faces, an estimator chasing the
disagreements would be chasing the wrong tool. With the cause named on every
row, what is left to look at is five small tessellation gaps and three odd
breps, not a pile of unexplained numbers. The reference volumes for both
models are now committed with the scripts, so the next check takes seconds
instead of 23 minutes of meshing.

Details, tables and the full listing:
[eval/turned-figure-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/turned-figure-2026-11-23.md).
Quantities from a model are estimates to check, not a priced bill.
