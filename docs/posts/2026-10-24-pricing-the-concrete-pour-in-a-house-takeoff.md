---
title: "Pricing the concrete pour: foundation labor in a free house takeoff"
date: 2026-10-24
description: "wall-framing-takeoff now prices foundation labor from rates you type, per slab square foot and per cubic yard placed, and keeps it out of tax and contingency."
tags: [construction, estimating, open-source]
---

# Pricing the concrete pour: foundation labor in a free house takeoff

`wall-framing-takeoff` already turns a house plan into studs, sheets, trusses,
shingles and a foundation's concrete, rebar, forms and gravel. Its budget
multiplies those quantities by prices you type; it ships none.

Today it gained foundation labor. Two optional rates join the plan's `prices`:

- `laborFoundationSqFt`: forming, rebar and finishing, per square foot of slab.
- `laborConcreteYd`: placing, per cubic yard of net concrete (before waste, since
  crews place what is poured, not what is ordered).

Like the wall, floor and roof labor lines, they appear only once a labor rate is
typed, and they sit outside tax and contingency. A foundation line with no rate is
listed as unpriced, not guessed. A test pins the arithmetic. No real subcontractor's
rates were checked; those are the open item.
