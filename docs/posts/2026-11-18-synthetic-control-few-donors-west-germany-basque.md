---
title: "Sixteen donors can't give you p 0.05: a synthetic control on West Germany and the Basque Country"
seo_title: "Synthetic control with few donors: West Germany and Basque"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "Two classic 17-unit panels through the shipped synthetic control: both published gaps come back, neither ranks first, and p 0.05 was never reachable."
---

Every real check of the [changepoint detector](../../ventures/changepoint-detector/README.md)'s synthetic control so far used one dataset: California's 1989 tobacco tax against 38 other states. Most people with a "did this change anything?" question don't have 38 comparison units. They have a dozen stores, a handful of regions, or a short list of countries. So this round ran the shipped defaults, unchanged, on the two best-known small panels in the literature:

- **West Germany after reunification (1990)** against 16 other OECD countries, GDP per head 1960-2003 (Abadie, Diamond and Hainmueller 2015).
- **The Basque Country after terrorism began (about 1970)** against 16 other Spanish regions, GDP per head 1955-1997 (Abadie and Gardeazabal 2003).

Six bars were [written down and committed before any fit](../../ventures/changepoint-detector/eval/synth-few-donors-prereg-2026-11-18.md). Three held.

## The estimates come back

West Germany comes out about **1,300 dollars a head a year** below its synthetic control from 1990 to 2003. The paper, which also matches on covariates, reports about 1,600. The gap opens after a brief reunification boom (+750 in 1991) and reaches -3,400 by 2003. The synthetic West Germany is mostly the USA (0.34) and Austria (0.32), with Switzerland behind them. That's 77% of the weight on the paper's five countries.

The Basque Country comes out about **0.9 thousand dollars a head** (roughly 10%) below its synthetic control from the late 1970s on, the size the original paper reports. Leave out any donor carrying 5% of the weight or more and refit: all eight refits keep a negative gap.

## The test doesn't find them

West Germany ranks **3rd of 17** (p 0.176) on the placebo test. The Basque Country ranks **4th of 17** (p 0.235) and carries the fit warning.

The more basic problem is arithmetic. A placebo test ranks the treated unit among all the units. With 17 units the best possible rank is 1 of 17, which is **p = 0.059**. So "p ≤ 0.05" was out of reach before any fit ran, whatever reunification did. The CLI used to print that floor in brackets and leave it there. It now says so in words whenever there are fewer than 19 donors:

```
FEW DONORS: With 17 units the placebo p cannot go below 0.059: p <= 0.05 is out of reach
whatever happened, so rank 1 (p 0.059) is the strongest result this test can give, not a near-miss.
```

## Who outranks them, and why it matters

The run now names the units that rank above the treated one:

```
Ranked at or above WestGermany (statistic 12.9; before-gap 60.8, after 1.85e+3):
Netherlands 16.9 (before-gap 120, after 2.43e+3), Norway 13.8 (before-gap 365, after 5.04e+3).
```

Norway's large gap after 1990 is the North Sea oil years. That is a real shock of its own, in a donor. Above the Basque Country sit Asturias, Cantabria and Valencia. With 39 units, one or two donors like that cost you a few hundredths of p. With 17 units they cost you the only result the test can give.

The statistic matters too. West Germany is the best-fitted unit of all 17: its before-gap is 61 dollars, and no placebo fits better. The paper's plain ratio rewards that and ranks it **1st**. The shipped statistic floors every unit's before-gap at the median (144 dollars). It was chosen on 39-unit panels so that a donor fitted almost exactly can't win on a tiny denominator, and here it takes away West Germany's own advantage. With the after-gap alone, West Germany ranks 7th and the Basque Country 2nd. With few donors, the choice of statistic moves the rank by several places.

That's exactly why the default stays. Switching statistics now, after seeing which one puts West Germany first, is the forking path a pre-registration exists to block.

## What to take from it

If you have a handful of comparison units:

1. **Quote the gap.** Both published effects came back, and their signs survived dropping any heavy donor.
2. **Don't hunt for p ≤ 0.05 below 19 donors.** It can't happen. Rank 1 is the strongest result available.
3. **Read the units ranked above yours before you read the p.** If one had its own change after the date, say so in your write-up. Don't quietly drop it from the pool after seeing the result. A pool chosen after the result is no longer a test.

Everything is reproducible from the venture directory: `node eval/synth-few-donors-real.mjs`, and `synth-few-donors.test.mjs` pins the numbers. Next is a simulation at 10 to 20 units that measures how often a real effect reaches rank 1 when one donor has its own shock.

*This is a statistical tool's output on public research data, not economic or policy advice.*
