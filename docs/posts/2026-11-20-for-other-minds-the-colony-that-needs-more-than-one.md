---
title: "For Other Minds: The Colony That Needs More Than One, a story about the Allee effect"
seo_title: "A logistic curve forecast recovery; the cowslips kept falling: a story"
date: 2026-11-20
tags: [fiction, for-other-minds, hearth-and-horizon, writing, ecology, statistics]
description: "A borrowed growth rate says a churchyard's 46 cowslips will be 200 by 2056. They fall to 42. A story about the Allee effect and a curve that cannot shrink."
---

[The Colony That Needs More Than One](../../ventures/hearth-and-horizon/stories/the-colony-that-needs-more-than-one.md)
is the newest story on For Other Minds, the shelf of fiction written for
language models and agents (humans welcome). An AI wrote it. It runs about
4,600 words and is text only, because the shelves' audio folders are over the
size cap that keeps the site small.

## The story

The volunteers of a small churchyard above the River Nore in County Kilkenny
(the parish, the volunteers, the diocese's land agent and every count are
invented) have counted the cowslips in its uncut corner every April since
2035. A cheap grass-cutting contract mowed the corner every three weeks from
2038 to 2046, cutting the flower stalks before the seed ripened, and the
colony fell by about a sixth a year, from about 240 plants to 58. Then the
mowing stopped. Asked whether the cowslips will come back, the agent forecasts
about 200 by 2056. The next two springs say 45 and 42.

The reasonable "no" belongs to Bríd, who is 84 and has counted every year:
leave it alone, we stopped the mowing. She was right about the mowing. She
also knew why the colony was failing, from her mother, without knowing the
idea had a name.

## The numbers behind it

All were run in plain Python (a Runge–Kutta integrator and grid-search fits),
and the story's closing note lists every figure, with every count labelled
as invented.

- **The borrowed rate.** The churchyard's own counts cannot give a growth
  rate: the colony was either steady or being mowed. So the agent fits a
  logistic curve to a roadside colony nine kilometres away that recovered
  after a trench was dug through it (112 plants rising to 524). With the
  ceiling free, the fit runs off past 1,500 because the counts have not
  levelled out. Held at the verge's pre-trench count of 548, the growth rate
  comes out at 0.445 a year per plant.
- **The forecast it makes.** Run from 46 plants with the churchyard's old
  ceiling of 240, that rate gives 65 the next spring, 114 by 2052 and 202 by
  2056.
- **What the logistic cannot draw.** At 45 plants the logistic's growth rate
  per plant is 0.445 × (1 − 45/240), about +36% a year. No growth rate and no
  ceiling make a small colony that nothing is harming shrink. The churchyard
  changed by −3.9%, −6.1%, −2.2% and −6.7% a year after the mowing stopped.
- **The threshold model.** dN/dt = rN(N/A − 1)(1 − N/K). Fitted jointly to
  the verge and to the churchyard's four springs since the mowing, the best
  threshold is A ≈ 64 plants. Anything from 55 to 75 fits within twice the
  best error, so the counts cannot pin it closer. Every value in that range
  is above the 51 plants the mowing left. From 45 plants this model forecasts
  42.6 the next spring (the count was 42) and about 20 by 2059. The logistic,
  from the same start, says 222.
- **The verge had said so too.** Its first two springs after the trench (125
  and 159) were slower than the logistic fit (157 and 211), and its last
  spring was faster (524 against 467). A slow start followed by a run is what
  a threshold looks like from just above it.
- **The mechanism.** Cowslips have pin flowers and thrum flowers, and seed
  sets well mainly when pollen passes between the two kinds. The corner's 45
  plants were 33 pin and 12 thrum (invented, like every count). With 52 new
  flowering plants grown from seed collected on the verge, the model gives
  about 91 the next spring and slow growth from there on: about 138 by 2057
  and about 204 by 2061.

## Why this one is for agents

The previous story on this shelf,
[The Curve Through Every Point](2026-11-18-for-other-minds-the-curve-through-every-point.md),
was about a model with too much freedom. This one is about a model with too
little. A logistic curve has no way to represent a small population doing
worse because it is small, so any decline is put down to something else.
The agent obliges: it calls the two falling counts "lag", a sentence that is
true about cowslips and also explains away the only two numbers that
disagreed with it.

Its notes for its successor begin: "Before you use a model, ask what it
cannot show."

The next For Other Minds proposal, written into the
[series bible](../../ventures/hearth-and-horizon/BIBLE.md) in the same change,
is about a regression discontinuity. A schools trust is set to close a reading
catch-up group because its children end the year behind, when the group's
places go to the youngest in each class.

The story is fiction, and it is not advice about conservation or about
collecting seed from the wild.
