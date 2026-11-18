---
title: "The leak tracker was drowning in drift: with demand removed it finds 13 of 32 leaks"
seo_title: "Leak source tracking on BattLeDIM: drift, not the method"
date: 2026-11-16
tags: [research, water-leaks, BattLeDIM, leak-localisation, water-distribution]
description: "On BattLeDIM's L-Town, a daily leak-source tracker keeps 8 sources instead of 20 once demand is removed, finds 13 of 32 leaks and dates 9 of 17 slow ones."
---

The [water-leaks](../../research/water-leaks/README.md) programme asks how well
leak detection and localisation work on BattLeDIM's L-Town, a simulated water
network with two years of sensor data and a published leak schedule. Nothing
here is a field result.

The [last step](2026-11-16-dating-leak-sources-by-onset-did-not-help.md) built
a daily tracker. Each day it fits the network's pressure anomaly as a sum of
leak sources at junctions, starting from yesterday's sources, and dates each
source by the day it first appeared. A new leak is placed at the newest source.
On a residual a utility could compute from its own data, it put only 8 of 32
leaks within 300 m. It kept about 20 sources active and started a new one every
three to four days, so the newest source was rarely the leak.

That left two explanations, and the plan written before the run said how to
tell them apart. Either the residual was drifting (a regression frozen on the
first two weeks of 2018 cannot follow demand through two years, so sources pile
up to absorb the error), or the "pick the newest" rule fails anyway, because
about 20 leaks overlap on L-Town.

## The test

Run the same tracker, with no setting changed, on a residual where demand is
removed exactly: published pressure minus the generator's own leak-free
simulation. No real utility has that model, so it is an oracle for demand. It
still contains every leak, so the tracker has to separate them itself.

## What happened

| residual, estimate | leaks within 300 m, of 32 | slow leaks, of 17 |
|---|---|---|
| demand removed, tracker | **13** | 3 |
| data only, tracker (last step) | 8 | 2 |
| data only, one-week rise | 14 | 5 |
| regression residual (step 11) | 15 | 5 |
| only the one leak left in (oracle) | 28 | 15 |

Chance would put 1.4 within 300 m.

- The tracker keeps a median **8 sources active instead of 20**, and never
  reaches its cap of 24.
- **9 of the 17 slow leaks** get a nearby source dated to their own start,
  against 4 on the data-only residual.
- Five of six pre-registered predictions held. The one that failed matters: the
  paired test against the data-only tracker (9 leaks only this one finds,
  4 only the other) gives P = 0.27. On 32 leaks, the gain is not significant.

So by the reading fixed before the run, drift is what sank the tracker, not the
dating idea. The slow leaks are now in the dated set, but their sources enter a
median 18 days after the leak starts, behind newer ones. The newest-source rule
picks only 3 of them.

## What it means for someone running a network

The hard part is the residual: removing demand from pressure without a
calibrated hydraulic model. With a clean residual, tracking sources day by day
does recover when the slow leaks began, which is exactly what a weekly
comparison loses. The next steps are a data-only residual that removes demand as
well as the oracle does (metered demands as regressors, or a rolling refit), and
an estimate that uses the whole dated set rather than only the newest source.

Code, results and the pre-registered plan:
[`research/water-leaks`](../../research/water-leaks/README.md), step 21.
