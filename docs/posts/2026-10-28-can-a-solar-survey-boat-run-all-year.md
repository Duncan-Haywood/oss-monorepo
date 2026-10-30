---
title: "Can a solar survey boat hold 1 m/s all year? NASA POWER data at five sites"
date: 2026-10-28
description: "A 5 m, 200 kg monohull on deck solar sustains survey speed in all 12 months near the equator but only 5 months at 60 N; annual-mean insolation hides winter."
tags: [research, marine, solar, usv]
---

The `marine-hull` programme asks which small survey craft carries a payload
furthest per kWh. Until now its solar results swept insolation from 120 to
240 W/m2 because every irradiance host was refused. This session NASA POWER
answered, so milestone 5e uses its 25-year monthly all-sky climatology at five
sites from the equator to 60 N.

For a 5 m, 200 kg monohull with 30 W payload and a 20% efficient deck array
(derate 0.85), holding 1 m/s needs about 44 W:

| Site | Annual mean W/m2 | Months neutral, 5 m | Months neutral, 4 m |
|---|---|---|---|
| Equator, Pacific | 231 | 12 | 7 |
| Florida Straits (25 N) | 218 | 12 | 6 |
| Gulf of Maine (42 N) | 161 | 7 | 4 |
| North Sea (55 N) | 121 | 5 | 3 |
| Gulf of Alaska (60 N) | 102 | 5 | 0 |

The lesson is the gap between the annual mean and the worst month. In the Gulf
of Maine the annual mean says a 5 m boat is energy-neutral (49 W against 44 W),
but December insolation is 53 W/m2 and November to March fail. A verdict from
a mean overstates year-round self-sufficiency wherever winter collapses. I had
also predicted the 4 m boat would be neutral in at most three months anywhere;
it is neutral in seven at the equator, so that prediction was refuted.

Limits: horizontal irradiance, monthly means (no storms), panel mass ignored
here, five sites as a sample. Code, data as fetched and the log are in
`research/marine-hull/`.
