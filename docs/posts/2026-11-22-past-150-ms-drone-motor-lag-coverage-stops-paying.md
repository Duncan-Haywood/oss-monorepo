---
title: "Past 150 ms, more motor-lag coverage stops paying at the measured lag"
seo_title: "Drone motor-lag randomisation: 200 ms vs 150 ms at ten seeds"
date: 2026-11-22
tags: [research, drones, codesign-cant, statistics, reproducibility]
description: "At ten seeds, training a quadrotor over motor lags up to 200 ms instead of 150 ms does not detectably cut crashes at the measured lag (p = 0.08)."
---

The [codesign-cant](../../research/codesign-cant/) programme tunes a small
quadrotor's gains with CMA-ES while randomising the plant. One randomised input
is motor lag. Two published identifications of 5-inch quadrotors put it at 33
and 39.1 ms. Earlier steps found that the training range should start at the
slow identification and run well past it. This morning's run found that a
ceiling of 150 ms (3.8× the slow identification) beats 125 ms at ten seeds
per geometry. Six seeds had hidden that gap.

The obvious next question was whether 200 ms (5.1×) beats 150 ms. At six seeds
the pair gave 65 against 53 crashes over the identified lags, p = 0.16. Since
six seeds had hidden the last gap, we ran the same experiment again. Seeds 6-9
of the 200 ms arm were trained in both centre-of-pressure geometries and scored
on the same held-out stress set. The predictions were committed before the run.

## What ten seeds show

The crash count covers flights that diverge at twice the trained
centre-of-pressure lever and a 45° tilt limit, summed over the 33, 36 and
39.1 ms laws.

| | 150 ms ceiling | 200 ms ceiling |
|---|---|---|
| crashes at the identified lags (of 3,840) | 112 | 86 |
| crashes with a 75 ms motor (of 1,280) | 462 | 217 |
| median mass, centre of pressure above / below | 1.47 / 1.43 kg | 1.57 / 1.49 kg |
| median 1 m-step rise, above / below | 2.08 / 1.83 s | 2.21 / 2.27 s |

At the identified lags the two ceilings are **not separated**: pooled
Mann-Whitney p = 0.08. Paired by geometry and seed, 150 ms crashes more in 13
of 20 pairs and ties in 4 (exact Wilcoxon p = 0.07). The point estimate is a
23% drop, so this is not proof that the extra coverage does nothing. It does
mean that ten seeds per geometry cannot detect a gain, and any gain is a
quarter or less. Compare 125 → 150 ms, which gave a 43% drop at p = 0.004 with
the same number of seeds.

With a motor slower than either identification, the extra coverage clearly
pays. At 75 ms, 200 ms crashes on fewer flights in all 20 pairs and less than
half as often overall. It costs 4-7% more mass and a slower step response.

We had predicted (prior 40% and 50%) that the pair would separate, and it did
not. Two other predictions failed as well. One was a floor of 2-4 crashes per
design with the centre of pressure above: two of the ten designs fell outside
it, at 1 and 6. The other result reversed a six-seed reading: 200 ms now rises
slower than 150 ms in both geometries.

## What a builder should take from it

Keep the training ceiling at about 4× the slowest identified motor lag. Go to
5× only if you think your motors may really be slower than the identification
says, because that is where 200 ms earns its extra mass.

Everything here is simulated, scored on one held-out seed of 64 episodes per
design and law. The paper draft, the stats script and the reproduction check
(every re-scored seed-0-5 record matches its stored value) are in
[`experiments/m12d_ten_seeds_c200`](../../research/codesign-cant/experiments/m12d_ten_seeds_c200/).
