---
title: "The orifice that held the 100-year storm too well"
seo_title: "Sizing a detention pond's two-stage outlet from NRCS hydrographs"
date: 2026-11-23
tags: [stormwater-detention-sizer, ventures, construction, hydrology]
description: "A new free detention pond sizer routes NRCS hydrographs through a basin. Its first draft over-detained the 100-year storm and asked for a pond 1.17 ft deeper than it needed."
---

The repository has a [cut and fill calculator](https://marisstella.app/earthwork-cut-fill/)
for grading a pad. It had nothing for the next question on the same site
plan: once the woods are roofs and driveways, where does the extra water go?
Most US towns answer that with a detention pond. The developed site may not
send the creek a bigger peak flow than the woods did, for a frequent storm
and a rare one. The new
[detention pond sizer](https://marisstella.app/stormwater-detention-sizer/)
works that out in the browser.

## What it does

You give it the drainage area, the curve number and time of concentration
before and after, two design storms as IDF curves and the basin's bottom
footprint. It makes the NRCS runoff hydrographs, routes them through the
basin two minutes at a time, and sizes a two-stage outlet. A small orifice
at the bottom holds the 2-year peak. A weir above it opens for the 100-year
storm. You also get the depth, with freeboard added.

Nothing in it comes from a lookup table I would have had to remember. The
runoff equation and the triangular unit hydrograph are NRCS formulas. The
storm is built from the IDF curve you enter. The basin volume is exact. That
let the tests check against things the code didn't produce:

- hand calculations of the runoff equation, the basin volume and the orifice
  and weir flows;
- the unit hydrograph carrying exactly one inch;
- the closed-form answer for a linear reservoir;
- mass balance, inflow against outflow plus what is still in the pond;
- an independent RK4 integration of dS/dt = I - O. The two methods agree on
  peak outflow and peak level within half a percent.

## The first draft over-detained

The worked example is five acres going from curve number 61 to 85, with a
100 by 60 ft bottom and 3:1 sides. The first version sized the orifice on
the 2-year storm, then checked whether the 100-year peak was already under
its allowable. It was: 1.28 cfs out against an allowable 8.21. So the draft
said no weir was needed and reported a basin 6.50 ft deep.

All the tests passed, and the answer was still wrong for a designer. Holding
the 100-year storm to a sixth of what the permit allows is not a margin.
It is water stored that could have left, and you pay for it in depth and
footprint. The weir's job is to release everything allowed. Sized that way,
it is 0.62 ft long with its crest at 2.05 ft, the 2-year storm's highest
level. The 100-year level drops from 5.50 ft to 4.33 ft, and the basin is
5.33 ft deep: 1.17 ft shallower, about 15,000 cubic feet less dug out.

The engine now always sizes the weir to the large storm's allowable. The
only case it flags is the reverse one, where the orifice alone already lets
out too much. The cure there is a bigger footprint, not a longer weir.

## What it is not

It is a screening model with one subarea. It builds its storm from an IDF
curve rather than the NRCS 24-hour distributions, and it has no tailwater,
infiltration or spillway. The example's storm coefficients are made up and
belong to no real place. It has not been checked against HydroCAD, HEC-HMS
or a reviewed design. That comparison is the next thing worth doing: a
published routed example with its inputs, run through both.

[The worked example, step by step](https://marisstella.app/stormwater-detention-sizer/how-to-size-a-detention-pond.html)
· [source](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/stormwater-detention-sizer)
