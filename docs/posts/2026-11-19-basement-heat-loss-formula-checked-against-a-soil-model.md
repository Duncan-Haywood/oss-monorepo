---
title: "Basements in the HVAC load calculator, and how far the textbook basement formula is from a soil model"
seo_title: "Basement heat loss: the path-length formula vs a 2-D soil model"
date: 2026-11-19
tags: [hvac, building-science, heat-transfer, javascript]
description: "The free HVAC load calculator now handles basements and skylights. A 2-D soil solve puts the basement wall formula 10% low and the floor formula 5-43% low."
---

[The room-by-room HVAC load calculator](https://marisstella.app/hvac-load-calc/)
used to say "no basements or skylights" on its
[how-it-works page](https://marisstella.app/hvac-load-calc/how-it-works.html).
That ruled out much of the northern US housing stock. Both now work. Before
shipping the basement formula I checked it against an independent solve,
and the floor half came out further off than I expected.

## The formula

A basement wall loses heat through the soil to the ground surface. Heat leaving
a deep strip of wall has a longer path to the surface than heat leaving the
top foot. Latta and Boileau (1969) modelled those paths as circular arcs. In
the closed form ASHRAE Fundamentals gives, a wall from grade down to depth
*z* has an average U-factor of

    U = 2k / (π z) × ln((z + 2kR/π) / (2kR/π))

where *k* is the soil's conductivity and *R* is the wall's own resistance. A
basement floor of shortest width *w* gets a similar log form. Both work against
the ground surface design temperature: the annual mean air temperature less
its seasonal swing, not the winter design air temperature. For a bare 8 in.
concrete wall 7 ft deep in moist soil (k = 0.8 Btu/h·ft·°F) that gives
U = 0.177 Btu/h·ft²·°F, about twice an R-13 frame wall's.

## The check

`eval/basement-fd.mjs` solves 2-D steady conduction in the soil around a long
basement on a grid of 0.25 ft cells, with conjugate gradients, about 200 lines
of plain JavaScript. The room is held at 1 and the ground surface at 0. The
heat entering through the wall and floor matches the heat leaving the surface
to ten decimal places. A second run holds the deep ground at the annual mean,
which is warmer than the surface on a winter design day. The closed form
ignores that.

| case | wall U, formula | wall U, soil model | floor U, formula | floor U, soil model |
| --- | --- | --- | --- | --- |
| 24 ft wide, 7 ft deep, bare | 0.177 | 0.198 (formula 10% low) | 0.030 | 0.041 (27% low) |
| 24 ft wide, 2 ft deep, bare | 0.351 | 0.390 (10% low) | 0.049 | 0.060 (18% low) |
| R-10 on the wall | 0.058 | 0.056 (3% high) | 0.030 | 0.053 (43% low) |
| R-10 under the floor | 0.177 | 0.210 (16% low) | 0.023 | 0.024 (5% low) |

The wall formula holds up: about 10% low on bare concrete and within 5% once
the wall is insulated. The floor formula is the weak half. It treats the floor
as if the wall weren't there. In the soil model, heat from the floor's edge
leaves through the soil beside the wall. When the wall is insulated, that soil
stays colder, and the floor's loss rises by more than a quarter (0.041 to 0.053) while the formula
doesn't move. With the deep ground held at its annual mean, the gap ranges from
31% low to 24% high.

Does it matter? On a worked cold-climate house (the calculator's example ranch
moved to 44°N, -5 °F winter design, over an 1,800 ft² basement 6 ft below
grade) the basement floor is about 2,350 Btu/h of a 53,000 Btu/h heating load.
A 27% miss there is about 1% of the total. The page states the gap and doesn't
patch it with a fudge factor.

The same house shows why basements had to be modelled at all. Its heating load
is 53,021 Btu/h over bare basement walls against 42,033 on a slab. R-10 on the
basement walls brings it to 45,844.

## Skylights

Skylights take an area, a tilt and the direction the roof slopes. The sun on the
glass is worked out hour by hour at that tilt, and the skylight's area comes
out of the attic ceiling. On the example ranch two 8 ft² skylights add about
1,300 Btu/h at the house peak, a bit over a tenth of a ton, and move the peak
from 3 pm to 2 pm. A flat skylight in July at 42°N gets more than twice the
direct sun of the same glass in a south wall.

The method, the tests and the solver are in
[the source](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/hvac-load-calc).
As before, this is an estimate from an open method, not an ACCA Manual J
report.
