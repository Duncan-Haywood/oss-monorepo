---
title: "Do empires get old? What 1,543 states since 3400 BCE say about how civilizations end"
seo_title: "How long do empires last? 1,543 states from 3400 BCE to 2024"
date: 2026-11-01
tags: [research, civ-patterns, history, data]
description: "Big empires never age: their risk of ending is constant. Small states die young. Over a century, the era predicts survival far better than age."
---

The story of civilizations is usually told as a life cycle: rise, maturity, decadence, fall. If
that were literally true, an old empire would face a higher yearly risk of ending than a young
one. Samuel Arbesman tested it in 2011 on Rein Taagepera's list of 41 ancient empires. He found
the opposite of a life cycle: lifespans fit an exponential distribution, the signature of a risk
that does not change with age, with a mean of about 220 years.

Forty-one empires is a small sample. Seshat's [Cliopatria](https://doi.org/10.1038/s41597-025-04516-9)
dataset (CC BY 4.0) now maps 1,587 named polities from 3400 BCE to 2024. We ran the same question
on it in [civ-patterns](https://duncan-haywood.github.io/oss-monorepo/research/civ-patterns/),
using standard survival analysis that handles states still alive today.

**Big empires really are memoryless.** For the 224 polities that ever held a million square
kilometres, the Weibull shape parameter is 0.91, with a 95% interval of 0.82 to 1.02. A value of 1
means a constant risk, so Arbesman's result survives a sample five times larger. Their yearly
risk of ending sits between 0.55% and 1.2% at every age we can measure (the highest, after age 400, rests on 14 endings).

**Small and new states die young.** Across all 1,543 polities, the risk is 1.1% a year in the
first 25 years. It then settles near 0.6% a year, about a 46% chance of ending in any given
century, and stays there until age 400. Only the few that pass 800 years show a lower rate.
There is infant mortality, then a long flat plateau, and no sign of old age.

**Size at birth does not protect.** Polities that started out larger did not last longer. Each
tenfold increase in initial territory raised the hazard by 6% (interval 0 to 13%).

**The era matters more than the age.** We asked a forecasting question. Using only data before
1600, 1700, 1800 or 1900, could a duration model tell which of the states then on the map would
still be there a century later? Mostly it could not. Within each cutoff, the models ranked
survivors little better than a coin flip (AUC 0.46 to 0.61). What changed was the whole world's
turnover rate. Of the states on the map in 1600, 35% were gone by 1700. Of those in 1800 and
1900, 78% and 79% were gone a century later: colonisation, the unifications of Germany and
Italy, two world wars and decolonisation.

Applied to today's 161 mapped states, the age-only model expects about half to survive under the
same name to 2124. The backtest says to read that as a wide range: about 65% if the coming century
is as calm as the 17th, about 20% if it churns like the 19th or 20th.

Caveats. Cliopatria ends a polity when its name changes, so "the end of a state" here includes
renamings and successions, not only collapses. Before 1000 BCE it maps a snapshot only every
century or so. And a model of age alone ignores everything a historian would look at. Code, data
handling and every number are in the
[project README](https://github.com/duncan-haywood/oss-monorepo/tree/main/research/civ-patterns).
Produced with AI assistance (Claude).
