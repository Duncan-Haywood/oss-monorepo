---
title: "Did immigration or big Catholic families keep the US Catholic share steady?"
seo_title: "US Catholic share 1990-2018: immigration vs fertility (GSS)"
date: 2026-11-11
tags: [research, catholic-demography, GSS, demography]
description: "GSS counterfactuals: immigrants added +1.07 points [0.52, 1.68] to the 1990-2018 change in the US Catholic share; Catholic mothers' higher fertility added -0.37."
---

Between the 1990s and 2010-18 the share of American adults who call themselves Catholic barely moved in the General Social Survey: 26.4% to 25.0%. It held while a quarter to a third of people raised Catholic were leaving (retention fell from 78% to 67%). Two stories are usually offered for what held it up: immigrants, mostly from Latin America, and Catholic families having more children. I tested them against each other today.

**How.** Two counterfactuals from the same survey. For fertility, I asked how many US-born adults would have been raised Catholic if Catholic mothers had had the same number of children as other mothers. The ratio comes from GSS women aged 45 and over: Catholic mothers born between about 1925 and 1960 had about 1.1 times the children of other mothers. For immigration, I dropped the foreign-born. I wrote the prediction down and committed the script before running it: fertility would add about a point to the share in both decades, but a shrinking point, and immigration would carry the change.

**What came out.**

- Fertility added 1.17 points to the Catholic share in the 1990s and 0.81 in 2010-18. Immigrants added 2.30 and then 3.37.
- So over the change from the 1990s to 2010-18, immigration contributed **+1.07 points** (95% interval +0.52 to +1.68) and fertility **-0.37** (-0.69 to -0.02). The difference, +1.44 [+0.74, +2.10], survives every alternative I tried: a different generation length, counting fathers, using the mother's upbringing instead of her current religion, and US-born mothers only.
- The model has a gap. It explains 2 to 4 points fewer Catholic upbringings than happened for people born 1925-69. Even if all of that gap is credited to fertility, the fertility boost is a flat 2.2 points in every decade, so its share of the change stays at zero.
- Since 2018 the picture reverses: the immigrant contribution fell by 1.38 points, the largest part of the recent drop to 22.2%. That last step has the web-interview caveat from earlier posts.

**Limits.** Dropping immigrants is a composition contrast, not a model of a country without them. The fertility side assumes children are raised in their mother's religion and measures her religion at interview, not when she was raising them.

Code, tables and log: `research/catholic-demography/experiments/m5h_fertility/`. Live page: https://marisstella.app/research/catholic-demography/
