---
title: "A smarter guard found the bend it was missing, and let one random walk in six through"
seo_title: "Slope-change test on short series: a guard that failed its bar"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, negative-result, climate-data]
description: "Pre-registered: a guard read off a hinge's residuals finds 99% of strong bends at 95 points, but rejects random walks 16% of the time. Not shipped."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a `--hinge-test` option that asks whether a trend changed slope once. It tests on the levels and models the noise as sticky (AR(1)). Before it runs, a guard refuses series that look like a random walk, because on a random walk any kinked line fits well and the test would cry wolf.

That guard measures stickiness on the residuals about a **straight line**. The trouble is that a real bend leaves a straight line's residuals sticky too. On global temperature since 1930 (95 years) the guard refused at 0.76, against its short-series limit of 0.7, so the test never ran on a series with an obvious late-century acceleration.

The obvious fix is to read the guard off the residuals of the best **bent** line instead. Before running anything, we wrote down four bars it had to clear to become the default, and ran both guards on the same seeded series.

**Where it worked.** Temperature since 1930 is now tested: knot 1974, warming from flat to 2.1 degrees per century, p 0.001. The longer temperature records give the same 1976 answer as before, and log US GDP and productivity are still refused. On simulated 95-point series with a strong bend, the shipped guard refuses 236 of 300 and finds the bend in 20.7%. The new guard tests all 300 and finds 98.7%.

**Where it failed.** A random walk with drift wanders, and a bent line fits wandering better than a straight one does. So the new guard let 171 of 300 random walks of 145 points through, and the test then rejected "no bend" on 16% of all of them, against a pre-registered cap of 8%. It also went over the cap at 60 points with sticky noise and no bend (10.7%). Two bars failed, so the default stays as it was. The option remains in the code for evaluation only.

The table points at a next try: a guard that needs both measurements to clear, or one that asks whether the bend cut the stickiness by more than a random walk's typical cut. These simulated cells have now been seen, so that try needs fresh seeds and its own pre-registration.

Simulated noise plus six public temperature and economic series. Scripts, seeds, the pre-registration and full tables are in the tool's README ("A guard read off the hinge's residuals").
