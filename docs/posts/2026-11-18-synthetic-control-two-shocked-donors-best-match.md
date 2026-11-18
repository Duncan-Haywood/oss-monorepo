---
title: "Two stores with their own bad months, and the one you leave out: a synthetic control simulation"
seo_title: "Synthetic control: two shocked donors and a shocked best match"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "With 11 to 16 units, two donors with their own shocks halve a real effect's rank-1 rate. Leaving out one is not enough; a shocked best match moves the gap."
---

The last round of the [changepoint detector](../../ventures/changepoint-detector/README.md)'s synthetic control work found that, with a small panel (11 to 21 stores, regions or countries), one comparison unit with its own event after the date is enough to take the placebo test away from a real effect. The estimate itself barely moved. That round left two questions open:

- What happens when *two* comparison units have their own events? Both real small panels we tested had two or three units ranked above the treated one.
- What if the unit with its own event is the one the synthetic control leans on most?

Eight bars were [written down and committed](../../ventures/changepoint-detector/eval/synth-two-shock-prereg-2026-11-18.md) after a 100-panel exploratory run and before the 400-panel confirmatory one. All eight held.

## The setup

The shipped panel generator ran with 11 or 16 units. The treated unit drops by two noise standard deviations from the date. Then one of three things happens after the date:

- two other units each get a step of their own, of the same size or twice the size, each with its own random sign;
- or a single unit gets a step, and it's the treated unit's heaviest donor, which carries about half of the synthetic control's weight;
- or nothing, as a reference.

"Rank 1" means the treated unit's statistic beats every placebo's. With this few units that is the strongest result the test can give.

## Each event takes its own share

| units | clean | one donor shocked | two shocked | one of the two left out | both left out |
|---|---|---|---|---|---|
| 11 | 54% | 40% | 28% | 35% | 53% |
| 16 | 56% | 38% | 27% | 36% | 56% |

One shocked donor costs 14-18 points, and two cost 26-29. If both shocks are twice the effect's size, the test finds the real effect only 5-8% of the time. With no effect at all it fires about that often anyway. The size stays honest throughout: with no effect and two shocked donors, rank 1 came up 4.5% and 1.5% of the time. Donors with their own events make the test blind. They never make it eager.

Leaving both shocked units out of the pool before the fit brings the clean rate back, to within 2 points. Leaving out only the one you knew about brings back only the one-shock rate. When the remaining event is large, it brings back almost nothing (7-12%). So if you know of one store's refit, keep looking for the second.

## A shocked best match moves the number, not the test

When the shocked unit is the one the synthetic control is mostly built from, the test barely notices. Rank 1 still comes up 43-45% of the time, more often than when a random donor is shocked. A donor that tracks the treated unit closely has a small placebo statistic of its own, so it rarely outranks it.

The estimate is a different story. The synthetic control *is* that donor, half of it, so the donor's step moves the estimated gap by about half the step. The mean absolute error of the gap rose 1.3x at 11 units and 1.6x at 16. Leaving that donor out beforehand did not fix it (1.36x at both sizes), because the remaining units fit the treated one worse. The average gap still looks right only because the sign was random across panels. A single real panel gets one sign.

On the two real panels from the last round, the units ranked above the treated one carry almost no weight: the Netherlands 0.000 and Norway 0.028 for West Germany, and 0.000 each for the three Spanish regions above the Basque Country. So their events moved the rank and not the estimate.

## What changed in the tool

- The FEW DONORS note in the CLI and on the page now quotes the two-shocked rates at the nearest unit count. It says that leaving out the one event you know of is not enough when another donor had one too.
- The "ranked above" note now names any unit above the treated one that carries at least 0.2 of its weight, and says that unit's own event moves the estimated gap too, not only the rank. It quotes the simulated error ratios and suggests reporting the gap both with and without that unit. `--json` lists each unit's `weight`.

Limits: one panel shape, step shocks only, and error ratios averaged over random signs. Next comes a donor whose event is a slope or a fading pulse, and a real deployer's panel. The [simulation](../../ventures/changepoint-detector/eval/synth-two-shock-sim.mjs), [its output](../../ventures/changepoint-detector/eval/synth-two-shock-confirm.out.txt) and the [README section](../../ventures/changepoint-detector/README.md) have every number.
