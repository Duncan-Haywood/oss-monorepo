---
title: "Solar row spacing: the 9-to-3 rule against the money answer"
seo_title: "Solar row spacing: what the 9-to-3 rule costs on real weather"
date: 2026-11-24
tags: [solar, energy, optimization, pvlib, pv-row-spacing-optimizer]
description: "A new free tool prices every tilt and row spacing of a ground-mount plant. On two real typical years, the winter 9-to-3 rule added $0.26/MWh at 36 N and $7.21/MWh at 55 N."
---

Every ground-mount solar plant has to settle early on how far apart the rows
go. The usual answer is the winter-solstice rule: space them so no row shades
the next between 9:00 and 15:00 solar time on the shortest day. It is safe and
easy to work out. It also ignores the land price, the value of the energy, how
much of a site's light is diffuse, and how a shadow knocks out whole
bypass-diode substrings rather than just the cells it covers.

The new [PV Row Spacing Optimizer](../../ventures/pv-row-spacing-optimizer/)
works out the spacing with money instead. It runs every fixed tilt from 0° to
40° and every ground coverage ratio (GCR) from 0.20 to 0.70, about 2,100
layouts, plus 51 single-axis tracker spacings, through a year of weather. It
then ranks them by net present value, using the land, installed cost, O&M and
energy price you type in. It runs in the browser in about a fifth of a second
on hourly data, and it reads PVGIS, NSRDB and TMY3 files.

## The physics, and how it was checked

Rows are long and parallel on flat ground, the same "infinite sheds" picture
that PVsyst and pvlib use. Two closed forms carry most of the work:

- the shaded share of a table's width is `1 - s_up / (GCR * cos AOI)`;
- the share of the sky a row's face sees past the row in front, averaged
  over the face, is `(1 + p - sqrt(1 + p² - 2p cos tilt)) / 2` with `p = 1/GCR`.

The second one came out of integrating the point view factor along the face.
The integral collapses to a square root, the same answer Hottel's crossed
strings give.

Everything was compared with pvlib-python 0.16.1, using a reference file
generated once so that the tests don't need Python:

- sun position was within 0.013° of NREL's SPA;
- the Ineichen clear sky was within 0.01 W/m²;
- shaded fraction and tracker backtracking angles matched pvlib exactly;
- a full clear-sky year on three fixed and two tracker layouts was within
  0.04% of pvlib's `infinite_sheds` for both beam and sky light on the rows.

## What the rule cost on real weather

The PVGIS and NSRDB services were refused from the build machine. pvlib ships
two NREL TMY3 typical-year files, so the page's defaults were run on those,
ranked by cost per MWh:

| Site | Cheapest fixed layout | 9-to-3 rule | Clear-sky design |
|---|---|---|---|
| Greensboro, NC, 36.1° N | 26°, GCR 0.40, $74.15/MWh | GCR 0.51, +$0.26/MWh | 32°, GCR 0.44, +$0.31/MWh |
| Sand Point, AK, 55.3° N | 36°, GCR 0.24, $124.00/MWh | GCR 0.088, +$7.21/MWh | 40°, GCR 0.23, +$0.16/MWh |

At 36° N the rule is a reasonable shortcut. At 55° N the winter sun at 9:00 is
about 2° above the horizon. Spacing rows for it means nearly three times the
pitch, and each MWh then costs 5.8% more. A design done on clear-sky
weather also promises far too much: 41% more energy than the typical year at
Greensboro, and 94% more at Sand Point.

Two files are not a survey. The next step is to run many sites once a
typical-year source can be reached, and to add parcels: read a boundary and
setbacks, then count tables instead of assuming the acres are all usable. The
script and its results are in `ventures/pv-row-spacing-optimizer/check/`.
