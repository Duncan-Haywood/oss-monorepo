---
title: "Quality fix: a RepRap's printed parts weigh 0.6 kg, not the 1.1 kg a model assumed"
seo_title: "RepRap Prusa Mendel printed parts: 0.6 kg measured from the STLs"
date: 2026-11-14
tags: [quality-audit, research, self-replication]
description: "We measured the 18 design STLs of the Prusa Mendel i2 and counted fasteners per printer. The recycling model's plastic falls by half; its conclusions hold."
---

The 2026-11-08 quality audit of [`research/selfrep-materials`](../../research/selfrep-materials/) ([audit file](../../portfolio/quality/audits/2026-11-08-selfrep-materials.json)) found one high-severity defect. The project's headline numbers rested on inputs nobody had looked up, and the real figures were findable. This run looked them up.

## What the project asks

A shop that builds copies of a RepRap Prusa Mendel (iteration 2) printer imports what it cannot make: motors, rods, bearings, electronics ("vitamins") and raw filament, sheet and bar. How much of that import can recycling remove? The model adds up imports per copy, with and without shredding plastic scrap and remelting aluminium offcuts.

## What was wrong

Two inputs:

- **Printed plastic.** Each of the 44 printed parts was given a flat 25 g, which makes 1.10 kg a copy. No source was given, and none is needed. The printer's design files are public.
- **Fasteners.** The wiki's bill of materials lists boxes: "100 M8 nuts. Easier to buy a box of 100, spares are handy." The model counted the whole box as part of one printer.

## What the files say

A new script, `experiments/stl_volumes.py`, downloads the 18 STL files the RepRap wiki links to and computes each mesh's volume. It sums signed tetrahedra over the triangles. First it checks that the surface is closed: every directed edge has to be matched by its reverse. All 18 are closed. Four have a few edges shared by four or six triangles, where OpenSCAD let two solids touch. That does not change the volume. A second tool, numpy-stl, gives the same 18 volumes to three decimals.

The 44 parts of one printer total **480 cm³ of solid plastic**. In PLA (1.24 g/cm³, the Ingeo 4043D data sheet) that is **0.595 kg**, and it is an upper bound, because real prints are partly hollow. The assumed 1.10 kg was 85% too heavy before infill is even counted. The two biggest parts are the extruder body (51.6 cm³) and the X-end motor mount (50.9 cm³). A bar clamp is 2.4 cm³, or 3 g, against the assumed 25.

For fasteners, the wiki's iteration-2 assembly guide has a "Parts Required" list at every step. Summed over the build, one printer uses 82 M8 nuts and 88 M8 washers, not 100 of each. The same count also turned up the other way round: the build uses 62 M3 washers and 18 M3x10 bolts, where the bill of materials lists 50 and 6. It also needs four M3x40 bed bolts and two M4 bolts, nuts and washers that the bill of materials leaves out.

## What changed in the results

For the shop with a printer, CNC router, laser cutter and furnace, with recycling on:

| | assumed list | sourced list |
|---|---|---|
| imported mass per copy | 6.46 kg | 5.84 kg |
| vitamins' share of it | 75% | 83% |
| cut from recycling own scrap (median over 2,000 draws) | 3% | 2% |
| electricity per copy | 9.7 kWh | 5.5 kWh |

The conclusions survive, and they get stronger. Vitamins dominate what a self-replicating shop imports even more than the model said. Recycling the shop's own scrap does even less. Plastic from retired machines is still the only recycling stream that moves the filament import much.

The Monte Carlo now also draws the fill fraction (0.5 to 1.0) and the plastic density (ABS 1.04 to PLA 1.24). Across those draws the vitamin share stays between 82% and 88%.

## What is still assumed

Motor, rod, bearing and fastener unit masses are still placeholders. So are every yield, scrap rate and specific energy, and the fill fraction. The README lists each one. The old list is kept in the code and still reproduces the old results exactly, so the two can be compared. The sibling projects that read it (`selfrep-closure`, `selfrep-recyclers`) have not moved to the sourced list yet. That is the next step.

The audit also listed a medium defect: no test covered any energy total, and setting the aluminium melt energy to zero left every test passing. A new test checks the printing, melting and machining energy by hand, and that seeded bug now fails it. There are six new tests, 16 in all.

## The second high defect in the queue

The other open high-severity defect had already been fixed, but nobody had recorded it. The 2026-11-07 audit of [`research/build-data`](../../research/build-data/) said its build-time targets were right-censored, which means permits still open at the time of the pull are missing from the data. Sessions 77 and 78 of that programme disclosed the problem in the paper's limitations and moved build-time scoring to mature cohorts (PR #15034, PR #15165). Both PRs are now listed in that audit's `fix_prs`, so the defect queue no longer shows it as open.

*Produced with AI assistance (Claude). Research code under MIT; the Prusa Mendel design files are GPL and are measured, not copied.*
