---
title: "What a two-foot eave does to a house's cooling load"
seo_title: "Roof overhang and air conditioner sizing, worked hour by hour"
date: 2026-11-18
tags: [hvac-load-calc, building-physics, hvac, construction]
description: "On an example 1,800 ft² ranch at 36° N, a 2 ft eave over every window cuts the south rooms' cooling 7 to 13% but the house peak only 3.3%. Here is why."
---

The [room-by-room load calculator](https://marisstella.app/hvac-load-calc/)
used to assume every window sat in full sun. Its own how-it-works page listed
that as a limitation that overstates the load. As of today each outside wall
can carry an overhang: how deep it is, how far above the window head it sits,
and how tall the window is. Nothing else changes.

## The geometry

The calculator already runs a 24-hour clear July day and knows where the sun
is each hour. For a horizontal overhang, the shadow edge falls below the
overhang by

> depth × tan(altitude) ÷ cos(sun azimuth − wall azimuth)

That ratio is the *profile angle*: the sun's height as seen looking square at
the wall. When the sun is off to one side, the profile angle is steeper than
the actual altitude, so the shadow reaches further down. Whatever share of the
window's height is in shadow gets no direct sun that hour. Sky and ground
light still count in full. That is slightly pessimistic, since an overhang
also hides part of the sky. The overhang is assumed to run well past both
sides of the window. The hand-worked cases are in
[`overhang.test.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/hvac-load-calc/overhang.test.mjs).
For example, sun due south at 45° under a 2 ft overhang 1 ft above a 4 ft
window shades exactly a quarter of the glass.

## What it does to a house

The calculator's example house is a made-up 1,800 ft² single-storey ranch at
36° N, with glass mostly to the south and west. I put the same eave over every
window: 1 ft above a 5 ft window, at depths of 1, 2 and 3 ft
([`eval/overhang-example.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/hvac-load-calc/eval/overhang-example.mjs)).

| Eave | Sun through windows at the peak | Sensible peak | Tons |
|---|---|---|---|
| none | 3,946 Btu/h | 19,732 Btu/h | 2.19 |
| 1 ft | 3,791 | 19,562 | 2.18 |
| 2 ft | 3,346 | 19,072 (−3.3%) | 2.14 |
| 3 ft | 3,329 | 18,690 (−5.3%) | 2.10 |

Room by room, at 2 ft, the effect is very uneven:

- Kitchen/dining (south and east glass): 4,276 to 3,959 Btu/h, −7%, and its
  peak moves from noon to 1 pm.
- Bedroom 3 (south glass): 1,615 to 1,398, −13%, peak noon to 1 pm.
- Living room and primary bedroom (west glass): −2 to −3%.
- North-only rooms: no change.

The reason is the July sun. At 36° N the noon sun stands about 74° up. Under
that, a 2 ft eave throws a shadow about 7 ft long, enough to cover a 5 ft
window with a foot to spare. By the 3 pm house peak, west glass is facing a
sun low enough to get under almost any practical eave. So an eave is a
south-wall measure. It matters a lot for the *airflow* each south room is
given, and only a little for the *tonnage* of a house whose peak comes from
west glass in the afternoon. Going from 2 ft to 3 ft hardly changes the sun
through the windows at the peak (3,346 to 3,329), but it lowers the house peak
by more than that. The deeper eave cuts the south rooms' midday gains, which
also shifts the house peak from 3 pm to 4 pm.

## Caveats

These are one invented house and one latitude, not measurements. The
calculator is not ACCA Manual J and uses none of its tables. Side fins, trees
and neighbouring buildings are still not modelled. If a quote's tonnage is far
above what this shows, ask why. For a permit, or before buying equipment, get
a full load calculation from approved software.
