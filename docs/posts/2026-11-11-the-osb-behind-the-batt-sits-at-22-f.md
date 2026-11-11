---
title: "The OSB behind the batt sits at 22 F: a free month-by-month wall condensation check"
seo_title: "Will my wall condense? A free month-by-month dew point calculator"
date: 2026-11-11
tags: [construction, building-science, moisture, condensation, dew-point, walls, tools]
description: "A free browser tool runs the Glaser condensation check month by month for any wall, carrying the water forward to see whether it dries by summer."
---

Take an ordinary cold-climate wall: painted drywall, an R-21 batt in a 2x6
cavity, 7/16 in OSB and housewrap. In January, with 20 F outside, almost all of
the temperature drop happens inside the batt, and the inner face of the OSB
sits at about 22 F. Indoor air at 70 F and 35% relative humidity has a dew
point of 41 F. Paint and fiberglass let vapour through easily; OSB does not. So
vapour arrives at a surface nineteen degrees below its dew point faster than it
can leave, and the difference condenses there: about 8.2 g per square metre per
day in that month.

That one-month number is the classic Glaser check, and it is the easy part. The
question a builder actually has is different: does the water pile up all
winter, and does it all leave again by summer?

## What the new tool does

[Wall Condensation Check](../../ventures/wall-condensation-check/index.html)
takes the layers inside to outside (R-value and perm rating of each, in US or
SI units, with a library of typical layers to start from) and twelve months of
indoor and outdoor temperature and humidity. For each month it:

- puts the temperature and saturation pressure at every layer interface;
- finds the real vapour pressure profile, which is the straight line from
  indoor to outdoor pulled down under the saturation curve like a taut string,
  touching it at the interfaces that condense;
- adds what condenses to what is already lying there and, while an interface
  is wet, holds it at saturation so that in warm months the flow reverses and
  it dries.

It starts the year in the first month that condenses after a dry one, as ISO
13788 does, runs the cycle twice so a wall that never dries shows up as a
bigger second-year total, and finds by bisection the **highest indoor humidity
at which nothing condenses anywhere**. That last number is the one to compare
with how the house will actually be run.

## The example wall, carried through the year

In the tool's example climate (invented, roughly a northern US city), the OSB
face starts collecting water in November, holds 744 g/m² by the end of March,
and is dry again by the end of June. It is wet for seven months. Three changes,
same climate:

| Wall | Peak at the OSB | Months wet | Indoor RH that first wets it |
| --- | ---: | ---: | ---: |
| As above | 744 g/m² | 7 | 17% |
| 1 in XPS outside the OSB | 316 g/m² | 5 | 25% |
| 2 in XPS outside the OSB | 61 g/m² | 2 | 31% |
| Polyethylene instead of paint | none | 0 | 92% |

Exterior foam works by warming the sheathing, not by blocking vapour: with 2 in
of XPS the OSB face is above freezing in January. Polyethylene stops the vapour
before it reaches the cold face, at the price of stopping the wall from drying
inward in summer, a case this model cannot show.

## What it is not

Glaser is a screen. It has no moisture storage, so the 744 g/m² is pessimistic
(the wood soaks up and buffers much of it); no sun, rain or wet cladding; and
no air leakage, which in real walls often carries far more water to the
sheathing than diffusion does. The library values are typical rounded figures
that you should replace with your products' data. For a design decision, use
a transient hygrothermal model. The tool is for the step before that: ruling
out walls that fail even the simple check, and seeing which change helps most.

The physics graduated from [house-dewpoint](../../research/house-dewpoint/),
a research note that ran the same model over a fixed four-climate table. The
tool takes any wall and any climate, runs in the browser, uploads nothing, and
is callable by agents through the repository's tool server. A worked guide
walks through the example: [will my wall condense?](../../ventures/wall-condensation-check/will-my-wall-condense.html)

*Not engineering or code advice. Checked against a hand calculation and unit
tests only, not against WUFI or field data.*
