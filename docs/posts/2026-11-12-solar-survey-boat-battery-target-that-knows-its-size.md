---
title: "A solar survey boat battery target that knows the battery size: 7% more distance and an unplanned lag"
seo_title: "Solar USV battery rule curve with storage capacity: 300 missions"
date: 2026-11-12
tags: [research, marine-hull]
description: "Putting battery capacity into a solar survey boat winter rule curve adds 7% distance past 40 degrees; a refill lag costs payload time."
---

The [last step](2026-11-12-solar-survey-boat-banking-the-battery-for-winter.md) gave a 4 m solar survey boat a daily battery target built like a reservoir's rule curve from nine other years of sunlight. It cut the payload's avoidable downtime by 91%, but at 40 degrees and beyond it cost a quarter to a third of the distance. The reason was simple: the winter shortfall there is 45 to 230 kWh against a 10 kWh battery, so the curve said "keep the battery full" every day of the year.

That curve was computed as if the battery had no ceiling, then clipped. A reservoir engineer would put the ceiling inside the calculation. A battery can't hold more than 10 kWh, so in summer the target only needs to be what the remaining sunny days can't refill before autumn. The target should climb to full just ahead of the dark season and fall away again ahead of spring. We tested that "capacity-aware" curve on the same 300 one-year missions (30 ocean points, 2015 to 2024, each year's curve built only from the other nine), with eight predictions committed before the run.

What happened (four of eight held):

- **The target now falls away for 4 to 8 months a year** at 40 degrees and beyond, and distance there rose **7%** (11 to 13 points of the simple rule's distance at 50 to 60 degrees). We had predicted 15%.
- **Payload downtime went up, a lot:** 11,211 avoidable dark hours against the old curve's 2,937. It is still 65% below the simple rule we started from (31,664).
- **It wasn't the climate record.** A curve built from the test year's own sunlight, which nobody could have in advance, did almost the same (10,729 hours).
- **A 10% sunlight haircut halves the damage** (5,237 hours) and keeps more distance than the old curve.

So what went wrong? The boat's speed rule closes the gap between its charge and the target over about ten days. The new target climbs from half to full over the last few weeks before the dark season, so the battery arrives short. After seeing the results we tried leading the target by up to 30 days. With a 30-day lead the downtime fell back to 2,954 hours, level with the old curve, and the 7% distance gain stayed. That variant was picked from twelve on the same data, so it is a lead to test on held-out years, not a result yet.

The bigger lesson is in the comparison. A planner who knows the whole year's sun covers 6% more than the simple rule even within 20 degrees of the equator, where no policy's payload ever goes dark. Battery targets can't touch that part. It comes from when the boat spends its sun: fast on bright days, slow on dull ones. That's the next lever to test, with a short weather forecast as the causal stand-in for foresight.

Caveats: calm water, daily energy steps, NASA POWER satellite sunlight on a half-degree grid, one boat design, launched full every 1 January. Code, predictions and results are in `research/marine-hull/` (milestone 6zl).

*Written with AI assistance (Claude Code).*
