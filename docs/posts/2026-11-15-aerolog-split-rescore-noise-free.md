---
title: "Re-scoring a month of drone layer-split results against an exact reference: what survived"
seo_title: "Drone airspace layer splits re-scored on an exact reference"
date: 2026-11-15
tags: [research, uav, airspace, reproducibility, negative-result]
description: "15 rules for assigning delivery-drone operators to altitude layers, re-scored without sampling noise: rankings hold, and one hidden 2.75% miss turns up."
---

`aerolog-scaling` has spent several weeks asking one practical airspace
question: when eight drone delivery operators share a city, which of them
should share an altitude layer? Every comparison from milestone 11g to 11w
chose a reference split with a sampled closed form (400,000 flight pairs) and
scored candidate rules on a sampled exact estimator. Earlier today milestone
11x showed that these two samples carry about 0.8% heavy-tailed noise and share
the same draws. So was any of that record real?

Today's step (11z) re-scored all of it against the exact, noise-free closed
form, which milestone 11y made cheap enough (about 50 CPU seconds per layout).
The predictions were committed before any layout was run.

**What survived, on 11g's 24 random eight-operator layouts:**

| rule a planner could use | mean excess over the best split (exact) | (sampled, as reported) |
|---|---|---|
| market share over hub distance | 19.4% | 18.9% |
| uniform service discs on paper | 6.4% | 6.2% |
| census residents + jobs on paper | 3.2% | 3.1% |
| census + take-off term | 2.9% | 2.7% |
| real destination lists on paper | 0.13% | 0.25% |
| sampled closed form, 400k pairs | 0.18% | 0 (it was the reference) |

Every mean moved by under 1%. No rule changed rank, including the fine
ordering of 11w's census blends, which I had predicted would flip. No rule's
count of layouts within 0.5% moved by more than one. 11v's one split fix
(layout 5, from 8.8% to zero) is real.

**What didn't:** the two sampled references fail together. On layout 6 they
picked the same split, so every rule that agreed with them scored a perfect
1.000, yet on the exact reference that split is 2.75% worse than the best.
Eleven rules sat on that hidden miss. On layout 22 they made a 1.65% miss look
like 3.2%. Five of nine predictions held.

**One result I didn't predict:** a 100 m grid integral over the operators'
real destinations picks the exact closed form's split more often (22 of 24
layouts) than the 400,000-pair sampled closed form it approximates (19 of 24).
On this question, a deterministic approximation beat a noisy estimate of the
exact quantity.

Limits: the exact closed form is still a model (straight legs, no avoidance, no
wind, 2014 ride-hail pickups standing in for deliveries, one city). 11r found
its optimum within 0.35% of the simulator's, so differences below that remain
unresolved. Results and code:
[`research/aerolog-scaling`](../../research/aerolog-scaling/), milestone 11z.
