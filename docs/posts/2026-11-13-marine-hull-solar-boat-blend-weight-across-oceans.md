---
title: "Tuned on the Pacific, tested on the Atlantic: the solar boat's speed rule keeps its weight, not its margin"
seo_title: "Solar USV speed rule: does the sun blend transfer across oceans?"
date: 2026-11-13
tags: [research, marine-hull]
description: "The blend of average and last-week sun that fixed a solar boat's heavy payload picks the same weight on either ocean; the payload-downtime margin is what slips."
---

The [previous step](2026-11-13-marine-hull-solar-boat-blend-average-sun-last-week.md) found a speed rule for a small deck-solar survey boat whose payload draws more than the deck harvests on an average day (50 W). Plan each day's speed from **half the average sun for that day of the year plus half the boat's own last 7 days of harvest**, and close the battery error over about a month. Against the 7-day-only rule it went 4 to 12% further with less payload downtime, at every battery size.

That was tuned on 2015 to 2019 and scored on 2020 to 2024 at the same 30 ocean points. A designer would ask two more things before using it. Does a weight tuned in one ocean hold in another? And is "half" a real answer, or just where a three-step grid happened to land?

So we split by ocean as well as by year. Tune on the 13 Pacific points in 2015 to 2019, then score on the 12 Atlantic points plus five coastal sites (North Sea, Gulf of Alaska and others) in 2020 to 2024, and the same the other way round. The weight now runs from 0 to 1 in eighths. We wrote six predictions down and committed them before running anything.

What came out:

- **The weight transfers.** For the 50 W payload the tuned weight lies between 0.375 and 0.625 in all 12 cases (3 splits x 4 batteries) and is exactly 0.5 in 7. Tuned on the Pacific, the Atlantic or everything, it moves by at most one eighth at any battery size.
- **It follows the payload.** The mean tuned weight is 0.08 for a 10 W payload, 0.17 for 30 W and 0.47 for 50 W. The less the deck can carry the payload on an average day, the more last week's sun should count.
- **The margin is what slips.** Tuned on the Pacific, the rule goes 14% and 35% further than the 7-day rule on the Atlantic test set with 10 and 20 kWh batteries. But it also spends more payload downtime than the 7-day rule (1.05x and 1.98x), so it fails our "better on both counts" test there. The fixed default (half and half, 30-day correction) fails it in 3 of 8 cross-ocean cases.
- **A finer grid matters in one place.** At 10 kWh, a weight of 0.375 goes 2.6 points further than the 0.25 a three-step grid could offer, with less downtime.

Three of six predictions held. The weight predictions held; the "it still wins on both counts in the other ocean" ones did not.

One pattern, read off the test tables after scoring and so not yet a held-out result: in both Pacific-to-Atlantic failures, one eighth less weight (0.375) still wins on both counts, going 11 to 15% further with 0.84x and 0.98x the downtime. A battery-scaled rule (0.5 with a 60-day correction at 2.5 kWh, 0.5 with 30 days at 5 kWh, 0.375 with 30 days at 10 to 20 kWh) wins on both counts in all 12 heavy-payload cases. Giving up one eighth of weight on a big battery costs 2 to 3 points of distance. That buys a margin against a sunnier ocean than the one you tuned on.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The two ocean splits share the coastal test sites and the same years. The battery-scaled rule was picked from the test tables and needs its own fresh split. Batteries and payloads are a sweep, not real vehicles. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zt).
