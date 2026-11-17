---
title: "When 40% of a panel get bored at once: read against the upper quartile, not the median"
seo_title: "Finding mass mid-survey click-through with an upper-quantile curve"
date: 2026-11-13
description: "Comparing each answer time with the panel's 75th percentile, not its median, lets a change-point check find a large group who all speed up at once."
tags: [quick-pick-survey, surveys, data-quality, response-time, changepoint, robust-statistics, simulation]
---

Earlier today [Quick Pick Survey](../../ventures/quick-pick-survey/)
gained a check for the respondent who gets bored: someone who answers the
first pairs with care, then clicks through the rest. For each person it finds
the point where their answer times drop the most. It reads every answer
against the whole panel's time *at the same point in the session*, so the
slow first pairs and the general speed-up that everyone shows are not mistaken
for boredom.

That write-up ended on a weak spot. When a large share of the panel (40%)
turns quick at the same moment, and only moderately quick (0.6x the honest
pace), the panel's median at that point moves down with them. Measured against
a curve that has moved with them, they look normal. Even after three passes
that rebuild the curve without the people already found, the check found only
about a third to a half of them.

## The fix is one number

The panel curve is now the **75th percentile** of everyone's log answer time
at each position, not the median.

The reason this costs nothing is that a change point compares the average
before a split with the average after it. Shifting the whole curve up by a
constant changes neither. Only the curve's *shape* across the session
matters. When nobody is careless, the 75th percentile has the same shape as
the median.

When a share c of the panel sits well below everyone else, the 75th
percentile of the mixture lands near the (0.75 - c)/(1 - c) percentile of the
honest people. At c = 0.4 that is roughly the honest median, which is the
curve we wanted all along.

## What the simulation says

There were 133 simulated cells: careless people who pick by a shared wrong
reason or at random, 25% or 40% of the panel, turning a quarter, half or three
quarters of the way in. They were run with and without a shared warm-up, with
and without a learning curve, and with turning points spread out or all at
once, plus cost cells with nobody careless and with a genuine minority taste.

| case | median curve | 75th percentile |
|---|---|---|
| 40% turn at 0.6x, same point: careless people found | 31-60% | **72-80%** |
| same, harm removed (share of the best possible) | 34-90% | **76-110%** |
| same, turning points spread over +-20% of the session | 63-85% | 89-90% |
| 25% turn at 0.6x, harm removed | 81-101% | 78-107% |
| any share at 0.4x, harm removed | 95-104% | 96-109% |
| nobody careless, or a real minority taste (Spearman cost) | -0.0003 to +0.0001 | -0.0003 to 0 |

At most 0.2% of honest people were flagged under either curve. Other
percentiles were tried too. The 60th lags at 40% careless. The 80th and 90th
lose ground when only a quarter are careless. The 70th and 75th tie, and the
75th ships because it holds up better if the careless share is larger still.

## What it still misses

About a fifth of the people who turn at 0.6x pace in a 40%-careless panel are
still missed: those whose own speed-up lands closest to the cut-off. It also
cannot see careless answers that are no faster than honest ones. No timing
check can. The view stays a comparison
(`?drop=fast-blocks` and the "Rank without answers after someone sped up"
button), not the default ranking, until a real panel's answer times show
whether people really get bored like this, and how fast they get.

The data, the sweep options (`--curve-q`, `--onset-spread`) and the
full table are in the venture's `docs/INFORMATION-GAIN-SELECTOR.md`, section
"A panel curve the careless cannot drag down", with every simulated cell in
`docs/fast-blocks-curve-q-2026-11-13.jsonl`.

*These figures come from simulations under stated assumptions about answer
times, not from real respondents.*
