---
title: "Rebar and grid-placed columns: what buildingSMART's own IFC samples showed our takeoff could not read"
seo_title: "Rebar weight from IFC: testing a takeoff on buildingSMART's samples"
date: 2026-11-22
tags: [ifc-quantity-takeoff, bim, quantity-surveying, evaluation]
description: "On buildingSMART's 46 IFC4.3 sample models the takeoff read 79 of 141 elements. It now reads 140, including every rebar with a length and a mass."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/README.md) turns
a building model into a bill of quantities in the browser. We had tested it
on real exports from Revit, ArchiCAD and Tekla. Today we tested it on the
reference set instead: buildingSMART's
[IFC4.3.x-sample-models](https://github.com/buildingSMART/IFC4.3.x-sample-models).
That is 46 small files, each showing one concept of the standard.

It read **79 of their 141 elements**. Three gaps accounted for nearly all of
the 62 it missed:

- **35 reinforcing bars.** A stirrup is written as a disk swept along an
  indexed curve made of straight segments and arc segments, the legs and
  the bends. The reader handled straight segments only.
- **25 columns placed on a structural grid.** `IfcGridPlacement` puts an
  element at the crossing of two grid lines, such as "E/1". The takeoff
  stopped at the first one.
- **1 kerb** swept along a road alignment with a fixed reference direction.

All three are read now: **140 of 141**. The last element has no body to
measure.

## Rebar gets a length and a mass

Estimators price reinforcement by the tonne. Each bar now gets its cut
length from its centre line, with the bends measured as true arcs. Its mass
is that length times the bar's section times 7,850 kg/m³, unless the
material names glass fibre, basalt, stainless or the like. The old steel
rule could not have weighed it: to keep reinforced concrete out, it rejects
any material name containing "reinforc", and rebar materials are called
"ReinforcingSteel".

buildingSMART's stirrup sample gives three checks:

- The cut length is 1.148 m. The bar's type states a `BarLength` of
  1,150 mm, and bar lengths are rounded to 5 or 10 mm.
- The mass is 1.02 kg, which is 0.888 kg/m, the table figure for a 12 mm
  bar.
- The volumes of all 35 bars are within 0.014% of IfcOpenShell's.

## Where the two kernels disagreed, the reference was wrong

We ran IfcOpenShell 0.9 over the same files. 110 of the 115 elements that
both read have volumes within 1%. In each of the other five, the
evidence points at IfcOpenShell:

- **The basin.** The set has the same basin three times: as an advanced
  brep, a faceted brep and a tessellation. Our three readings are 0.00204,
  0.00204 and 0.00203 m³. IfcOpenShell agrees on the last two, but its
  advanced-brep reading is 0.00554 m³.
- **The kerb.** IfcOpenShell sweeps the whole 950 m curve. The file trims
  the sweep to stations 300 to 600, which gives 9 m² × 300 m = 2,700 m³.
- **Two railway signals.** IfcOpenShell gives each more than 1,300 m³.
  Each fits in a box under 0.9 m³.
- **The sectioned solid.** IfcOpenShell builds lofts as open shells, so
  their volumes cannot be trusted. Ours comes to 2,700 m³, the same section
  over the same 300 m as the kerb.

IfcOpenShell builds none of the 25 grid-placed columns, so there is
nothing to compare them with. Hand-worked tests cover them instead: the
crossing, the offsets and the turned placement.

The method, the raw output and what is left (cant, and drawing bars in the
3D view) are in
[eval/bsi-samples-2026-11-22.md](../../ventures/ifc-quantity-takeoff/eval/bsi-samples-2026-11-22.md).
