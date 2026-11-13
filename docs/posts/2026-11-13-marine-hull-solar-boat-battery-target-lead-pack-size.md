---
title: "Re-tuning a solar boat's battery target for its pack: small gains, one real rule"
seo_title: "Solar USV battery target lead and feedback by pack size"
date: 2026-11-13
tags: [research, marine-hull]
description: "Across 12 simulated solar survey boats, re-tuning the battery target's lead per pack buys at most 0.8% more distance; the feedback should grow with the pack."
---

Yesterday's [pack-size sweep](2026-11-12-marine-hull-solar-boat-battery-feedback-pack-size.md) tested a speed rule for a small deck-solar survey boat on a year-long mission. The rule plans the day's speed from the average sun for that day of the year, then corrects toward a battery target over about 20 days. It held up for 2.5 to 20 kWh packs. One loose end remained. The target is built to start filling the battery 45 days before each dull season, and that 45-day "lead" had only ever been tuned on the 10 kWh, 30 W boat. A bigger battery takes longer to fill, so maybe the lead was the part that should change with the pack, and the feedback constant had been quietly making up for it.

We wrote six predictions before running anything. Then we let each of the same 12 boats (packs of 2.5, 5, 10 and 20 kWh, payloads of 10, 30 and 50 W) pick both its lead (0 to 90 days) and its feedback (10 to 60 days) on 2015 to 2019 sunlight, and scored it on 2020 to 2024 at 30 ocean points.

What came out:

- **The lead does move with the pack**: 30, 45, 60 and 60 days for the four packs with a 10 W payload, and 30 days for every pack but the largest (60) at 30 W.
- **But the feedback doesn't settle; it also grows with the pack.** About 10 days at 2.5 kWh, 20 at 5 to 10 kWh, 30 at 20 kWh. That was the prediction we expected to hold (20 days in at least 8 of 12 boats), and it came in at 3 of 12. Lead and feedback don't trade off. A bigger battery wants both a longer lead and a slower correction.
- **The gain is small.** Where the panel can carry the payload, re-tuning adds at most 0.8% more distance over the old 45-day lead, usually 0.2%. Even that mostly comes from using up some of the payload-downtime margin, not from a free improvement.
- **The heavy-payload problem isn't a tuning problem.** With a 50 W payload, more than the deck's average harvest, no lead or feedback in the grid lets the average-sun rule match the simpler last-week rule's distance on packs of 10 kWh or less. Re-tuning narrows the shortfall by about 2 points but doesn't close it. The fix has to come from how the rule estimates power, not from the target.

Three of six predictions held.

For a designer the takeaway is short. If the panel can carry the payload, keep the 45-day lead (30 is as good), and scale the battery feedback with the pack, roughly 10 days at 2.5 kWh up to 30 at 20 kWh. Spending effort tuning the lead per boat isn't worth it.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. There's one five-year tuning window and coarse grids (six leads, four feedback values), and the packs and payloads are a sweep, not real vehicles. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zq).
