---
title: "Banking a solar survey boat's battery for winter: a rule curve from ten years of sunlight"
seo_title: "Solar USV battery reserve for winter: rule curve tested on 10 years of NASA POWER data"
date: 2026-11-12
tags: [research, marine-hull]
description: "A pack-target curve built from other years' sunlight cuts a solar survey boat's avoidable payload downtime by 91% over 300 one-year missions; the price is up to a third of its distance at high latitude."
---

The [last step](2026-11-12-solar-survey-boat-a-year-on-one-battery.md) carried a 4 m solar survey boat through 2024 on one 10 kWh battery. It found that past 40 degrees the 30 W payload goes dark for months whatever the boat does: a buoy with the same panel and battery that never moves goes dark on the same days. But the simple speed rule we gave the boat did worse than that floor. It kept only half a battery in reserve all year, so it went into the dark season part-empty, and its payload was off for 15 to 38 more days than necessary at every point from 30 degrees out.

A planner can't know next winter's sun. They can know the climate. So this step gave the boat a target for how full its battery should be on each day of the year, built the way reservoir operators build a "rule curve" for a dam: from the average sunlight of past years, work backwards from the end of the dark season and add up how much stored energy the payload would need to get through it. The boat only spends energy on moving when the battery is above that day's target.

To test it honestly we used ten years of NASA POWER daily sunlight (2015 to 2024) at 30 points: two ocean meridians from 60 S to 60 N and five coastal survey sites. Each year's curve was built only from the other nine years, giving 300 one-year missions. Eight predictions were committed before the extra nine years of data were fetched.

What came out (seven of eight held):

- **Payload downtime above the unavoidable minimum fell 91%,** from 31,664 to 2,937 hours summed over the 300 missions. At 40 degrees and beyond, the payload stayed within a day of the minimum in 119 of 140 missions.
- **A calendar rule isn't enough.** "Fill the battery from the autumn equinox" cut the avoidable downtime by only 22%. The curve's timing comes from the local sun, not the date.
- **The climate record is good enough.** A curve built from the test year's own sunlight, which no operator could have, did only 6% better.
- **In the tropics nothing changes.** Within 20 degrees the curve never asks for more than half a battery, and distance is identical.

The prediction that failed was about cost. We expected the boat to give up at most 10% of its distance at 30 degrees and beyond; the median was 16%, and at 50 to 60 degrees it was 28 to 35%. The reason, found after reading the results: at those latitudes a year's average sunlight harvests 17 to 24 W, less than the 30 W payload, and the winter shortfall is 110 to 230 kWh against a 10 kWh battery. So the curve says "keep the battery full" every day of the year, and the boat moves only on sun it can't store.

That leaves room. A planner with perfect knowledge of the year matches the same minimum downtime and still covers 6 to 16% *more* than the old simple rule, because it knows when spring is coming and spends the reserve before then. The next step is a curve that also counts forward to the recovery date.

Caveats: the boat is modelled in calm water with daily energy steps; ten years is a short climate record; the smoothing window and the half-battery floor were fixed, not swept. Code, predictions and results are in `research/marine-hull/` (milestone 6zk).

*Written with AI assistance (Claude Code).*
