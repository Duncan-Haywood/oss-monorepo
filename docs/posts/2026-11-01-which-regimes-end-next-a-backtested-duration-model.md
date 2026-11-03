---
title: "Democracies age into stability, anocracies never do: a backtested model of regime change since 1800"
seo_title: "How long do political regimes last? Polity5 data and forecasts"
date: 2026-11-01
tags: [research, civ-patterns, political-science, forecasting, data]
description: "In 1,387 regimes since 1800, democracies grow safer with age and hybrid regimes never do. A backtested model forecasts 10-year regime change with AUC 0.69."
---

Does a political regime get safer with age? Using the Polity5 dataset (1,387 regime spells in
167 countries, 1800 to 2018) we measured the yearly chance that a regime ends at each age, and the
answer depends on the kind of regime.

![Yearly chance of ending by age for regimes and for states and empires](https://raw.githubusercontent.com/duncan-haywood/oss-monorepo/main/research/civ-patterns/experiments/hazard_by_age.svg)

- **Democracies** (Polity 6 to 10) face a 5 to 10% yearly risk in their first decade. After age
  40 it falls to 0.5%.
- **Anocracies**, hybrid regimes scoring -5 to 5, start at 13 to 15% a year and never fall below
  about 4.5%.
- **Autocracies** plateau near 4.5% after age 40.

Anocracies end 1.9 times as fast as democracies (95% CI 1.6 to 2.2). That replicates Gates,
Hegre, Jones and Strand (2006), who found that "inconsistent" institutions are the least durable.

One definition matters for reading all of this. In Polity, a regime spell ends with any change of
three or more points on its 21-point scale, or with a collapse or transition. Most endings are
therefore reforms, backsliding or new constitutions, not revolutions.

**Can it forecast?** We pretended to stand in 1966, 1976, 1986, 1996 and 2006. Each time we fitted
the model only on what was known then and forecast which regimes in place would end within ten
years: 696 forecasts in all. A piecewise model by regime type and age ranked the regimes that
ended above those that did not 69% of the time (AUC 0.69). It beat a constant-risk baseline on
Brier score (0.222 against 0.252). Fitting on only the most recent 40 years gave the best
calibration. Every version forecast too few endings, though: the post-1960 world changed regimes
faster than its own past implied.

**From 2018 to 2028.** Fitted on everything, the model expects 67 of the 162 regimes in place at
the end of 2018 to end by 2028:

- 60% of anocracies;
- 46% of autocracies;
- 32% of democracies.

The top of the list is young hybrid regimes: Fiji, Comoros, Cuba, Ethiopia, Cambodia and
Venezuela, at 70 to 72%. The bottom is democracies that have held Polity 10 since the 1940s and
1950s: Japan, Ireland, Costa Rica and the Nordic countries, at 5 to 7%. The United States' spell
was only two years old in 2018, after its score fell from 10 to 8 in 2016, so the model gave it
55%. Polity5 updates only a handful of countries past 2018, and the US is one of them. In that
update the spell ended in March 2019 and the score reached 5 by November 2020. One case proves
nothing, but it is the kind of check the full forecast list in
[`forecast_2018.csv`](https://github.com/duncan-haywood/oss-monorepo/blob/main/research/civ-patterns/experiments/regimes/forecast_2018.csv)
can be held to once 2019 to 2028 data are in.

These are base rates for a regime of a given type and age, not judgements about any country.
The model knows nothing about economies, elites, wars or elections. Turning it into an analyst's
tool means adding those (Goldstone et al. 2010 is the standard model) and testing whether the
age effect survives. That is the next step in
[civ-patterns](https://duncan-haywood.github.io/oss-monorepo/research/civ-patterns/). Polity5 data
© Center for Systemic Peace, used under their citation terms and not redistributed. Produced
with AI assistance (Claude).
