---
title: "Half average sun, half last week: the speed rule that fixes a solar boat's heavy payload"
seo_title: "Solar USV speed planning: blend climatology and last week's sun"
date: 2026-11-13
tags: [research, marine-hull]
description: "A solar survey boat that plans speed from the mean of average and last-week sun beats both rules at a 50 W payload: 4 to 12% more distance, less downtime."
---

The [previous step](2026-11-13-marine-hull-solar-boat-heavy-payload-speed-gate.md) left one case open. A small deck-solar survey boat plans each day's speed from an estimate of that day's solar power, plus a slow correction toward a battery target. Two estimates had been in play:

- **average sun:** the long-run average harvest for that day of the year, from earlier years;
- **last week:** the mean of the boat's own harvest over the past 7 days.

Average sun won almost everywhere. The exception was a payload drawing 50 W, more than the deck harvests on an average day. On a 2.5 or 5 kWh battery the average-sun rule still covered only 93% and 96% of the last-week rule's distance, even after we dropped the "wait until the sun covers the payload" gate. Our guess was that the last-week rule moves on the sunny weeks inside a dull season, and the average-sun rule averages those weeks away.

So we tried estimates that keep both: the larger of the two, three weighted averages (25/50/75% last week), and the average sun scaled by how sunny the last week was compared with normal. We wrote five predictions down and committed them before running anything. Then we ran the same 12 boats as before (2.5 to 20 kWh packs, 10 to 50 W payloads), tuned on 2015 to 2019 NASA POWER sunlight at 30 ocean points and scored on 2020 to 2024.

What came out:

- **The 50/50 average wins the heavy-payload case.** At 50 W, the tuned rule is a blend at all four packs, and it beats the last-week rule on both distance and payload downtime at all four: **1.04x the distance at 2.5 kWh and 1.05x at 5 kWh** (average sun alone: 0.93x and 0.96x), 1.05x at 10 kWh and 1.12x at 20 kWh, with 53 to 94% of the downtime.
- **It isn't about moving more often.** On the 2.5 kWh boat the blend moves on 21.0% of days against average sun's 20.0%, yet covers 12% more distance. The gain is in how fast it goes on the days it does move.
- **The obvious combinations overspend.** Taking the larger of the two estimates is biased high, so it drains the small pack before a dull spell: more distance, but up to 5x the payload downtime. Scaling the average sun by last week's anomaly behaves almost exactly like the last-week rule. An additive half-and-half average is what keeps the season in the plan.
- **Light payloads barely care.** At 10 and 30 W, plain average sun is still the tuned pick for 5 of 8 boats, and a blend adds at most 1.3% distance.

Four of five predictions held. The miss was the mechanism: we predicted the larger-of-two rule would move on at least 5 more percentage points of days; it moved on 4.1 more.

This also corrects an earlier reading. Yesterday we concluded that letting recent weather back into the plan "does not help". That holds for multiplicative anomalies (30-day or 7-day). It doesn't hold for a plain average once the payload draws more than the mean harvest.

For a designer the rule is: below the mean harvest, plan from average sun; above it, plan from the mean of average sun and last week's sun, and close the battery error over 30 to 60 days.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. There's one five-year tuning window and a coarse grid (three blend weights, four feedback times), and on the smallest pack the tuned feedback time sits at the grid's edge. The packs and payloads are a sweep, not real vehicles. Next is a test across oceans rather than years. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zs).
