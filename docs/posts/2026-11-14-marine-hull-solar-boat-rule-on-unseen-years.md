---
title: "A solar boat's self-tuning battery rule, frozen and flown on ten unseen years"
seo_title: "Solar USV battery feedback rule tested out of sample, 2005 to 2014"
date: 2026-11-14
tags: [research, marine-hull]
description: "Frozen and flown on 2005 to 2014 NASA POWER sun, a solar boat's self-tuning battery rule beats the 7-day rule in 48 of 56 cases; 7 of 7 predictions held."
---

The [last step](2026-11-14-marine-hull-solar-boat-self-tuning-feedback.md) gave a simulated solar boat a way to check its own sun forecast. Each day it divides its last 60 days of solar harvest by what its climatology (the average sun for each day of the year) promised for those days. It then uses that ratio to pick how fast to correct its battery toward a target: 60 days if the forecast looks pessimistic, 30 if it looks honest, 20 or 10 if it looks optimistic. That rule won in 46 of 56 cases. It had a weak spot, though. The table it reads from was itself read off those same 56 cases, so the result could have been a fit to the data rather than a rule.

This step tested it on data it had never seen. We fetched ten more years of daily NASA POWER sunlight, 2005 to 2014, at the same 30 ocean points. No earlier step had touched those years. The boat planned with a climatology built only from 2015 to 2024. Everything else was frozen: the table, the ratio, the blend weights and the 14-day start-up assumption. We wrote seven predictions into the experiment file and committed it before the data were downloaded. Then we reran the same stress test as before. That test scales the climatology from 0.97 to 1.03 and scores two five-year halves and four battery sizes from 2.5 to 20 kWh, with a 50 W payload.

What came out:

- **The rule held.** On the new years it goes at least as far as the plain 7-day rule with no more payload downtime in 48 of 56 cases. In sample it won 46. With a 90-day window it won 51 (48 in sample). It wins at least 6 of 8 cases at every bias level.
- **The fixed rules did not catch up.** The two best fixed-feedback rules from earlier steps won 37 and 44. The one with the slower feedback collapses when the forecast is optimistic, winning 1 of 8 cases at 2 to 3% optimism, because it keeps spending sun that never arrives.
- **It matches an oracle.** A rule told each case's true bias, and fixed to the matching feedback time, won 47.
- **The decade-old sun was close to the later climatology.** Harvest in 2005 to 2014 was 0.993 to 0.995 of what the 2015 to 2024 climatology promised. So the bias range in this test comes mostly from the deliberate 0.97 to 1.03 scaling, not from the years themselves.

All seven predictions held. That is unusual for this programme, and it is the result we wanted: a rule read off one decade survives the other one unchanged.

The remaining failures are worth knowing. The rule fails in two ways:

- With the smallest pack (2.5 kWh) and a pessimistic forecast, it banks too much and gives up 0.4 to 2.7% of distance.
- With the 10 to 20 kWh packs and an optimistic forecast, it runs the payload dark slightly more often than the 7-day rule (2 to 7% more dark hours). The 90-day window fixes three of those five cases.

For someone writing a solar boat's energy manager: keep a 90-day ratio of harvest to forecast, and feed it into a four-step feedback table. In these simulations, that rule did not need the forecast to be accurate within 3%.

Limits: the years are new, but the points, the 4 m hull and the payload are not. The forecast error is one uniform factor, while real climatology errors change with the season. That seasonal test is next. This is a simulation only: calm water, daily steps, NASA POWER sunlight on a 0.5 by 0.625 degree grid, and a boat that starts each year with a full pack. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zx).
