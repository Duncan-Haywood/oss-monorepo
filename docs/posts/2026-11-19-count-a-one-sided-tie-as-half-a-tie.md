---
title: "Count a tie only one end names as half a tie"
seo_title: "A soft reciprocity filter for village network surveys"
date: 2026-11-19
tags: [research, networks, diffusion, seeding, surveys]
description: "Dropping ties only one household names helps or hurts village seeding, depending on a number no survey measures. Half weight is close to the better choice."
---

The `civ-seeding` programme asks which households a rollout (solar lamps, cookstoves, microfinance) should reach first. It works on the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013). The best rule so far is *degree discount* on a census of the network. It ranks households by their ties and discounts those already next to a chosen seed.

Network surveys have two kinds of error. Respondents forget real ties, and they name ties that do not exist. The field's usual fix for the second kind is the *reciprocity filter*: keep a tie only if both ends name it. [Earlier today's step](2026-11-19-the-reciprocity-filter-fails-when-both-ends-invent-the-same-tie.md) found the filter's sign depends on one thing. When false ties are one-sided, the filter saves census degree discount 0.6 point of adopters. When both ends name the same false tie (two families who went to the same wedding), the filter keeps it, and the filter costs 0.6 point. A survey cannot tell those two cases apart, because a mutual false tie looks exactly like a true one.

## Don't choose

This step tries the obvious compromise. A tie that both households could have named, but only one did, is kept at weight *w* instead of being dropped (w = 0) or kept in full (w = 1). Degree discount takes weighted ties with no change: a half tie adds half to a household's degree and discounts its neighbour half as much.

The harness is unchanged from the last three steps. Every rule gets five Monte Carlo copies over 500 joint bootstrap draws of the fitted adoption models. Each end of a tie is recalled with probability 0.85, and there is one triangle-closing false tie per two true ones. Weights 0, 0.25, 0.5 and 0.75 were each run at three shares κ of false ties named by both ends (0, 0.5, 1). The four hypotheses, and a prediction that regret would be linear in the weight, were written down before the run.

## What it found

Median worst-case share of adopters lost by census degree discount (lower is better):

| share of false ties both ends name | drop (w = 0) | w = 0.25 | w = 0.5 | w = 0.75 | keep (w = 1) |
|---|---|---|---|---|---|
| none (κ = 0) | 2.18% | 1.95 | 2.05 | 2.62 | 2.78% |
| half (κ = 0.5) | 2.99% | 2.75 | 2.49 | 2.77 | 2.78% |
| all (κ = 1) | 3.41% | 2.97 | 2.83 | 2.70 | 2.78% |

- With one-sided false ties, the half weight saves 0.73 point against keeping every report (z 4.4). That is more than dropping one-sided ties saves (0.60).
- With all false ties mutual, it costs +0.05 point (se 0.27), where dropping them costs +0.63.
- Its worst case over κ, 2.83%, ties keeping every report (2.78%). Dropping one-sided ties has a worst case of 3.41%.
- For plain top-degree ranking the weight buys nothing measurable, and dropping one-sided ties stays the better choice.

The linear prediction was wrong, on the helpful side. Every soft cell for degree discount sits below the straight line between the two ends, by up to 0.43 point, so a middle weight gets most of each end's advantage. Three of the four expected verdicts were wrong: two hypotheses expected to fail held, and the top-degree one expected to hold failed.

## What it means for a survey team

If a census will feed degree discount, count a tie only one household names as half a tie. Then nobody needs to know how often false ties are mutual: the half weight is close to the better of the two hard choices at every κ swept, and the best point estimate when about half of false ties are mutual (against keeping every report that edge is within noise: −0.29, se 0.26). The likely reason, not yet tested: degree discount uses ties twice, to rank households and to space seeds apart. A half tie keeps some of the real ties a hard filter throws away, and a false one pushes seeds apart only half as hard.

The limits are plain. The step used one false-tie rate and one placement, the worst case for every rule in an earlier step. It used three κ points and four weights chosen in advance. The next checks are a lower false-tie rate, random placement and the half-village survey.

Code, results and the logged plan: [`research/civ-seeding`](../../research/civ-seeding/README.md), milestone 19 ([`verdicts.txt`](../../research/civ-seeding/experiments/m19_soft/verdicts.txt)).
