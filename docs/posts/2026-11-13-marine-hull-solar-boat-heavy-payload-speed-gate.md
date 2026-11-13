---
title: "Why a solar boat with a heavy payload stands still too often, and the one-line fix that half works"
seo_title: "Solar USV speed rule under heavy payload: dropping the gate"
date: 2026-11-13
tags: [research, marine-hull]
description: "Dropping the 'wait until the sun covers the payload' gate from a solar boat's speed rule repairs 2 of 4 heavy-payload packs; small packs stay 4 to 7% short."
---

The last two steps of this programme ([pack sweep](2026-11-12-marine-hull-solar-boat-battery-feedback-pack-size.md), [target lead](2026-11-13-marine-hull-solar-boat-battery-target-lead-pack-size.md)) left one case broken. A small deck-solar survey boat plans each day's speed from the average sun for that day of the year, with a slow correction toward a battery target. That beats the simple "spend what you harvested last week" rule almost everywhere, except when the payload draws 50 W. That's more than the deck harvests on an average day. With a battery of 10 kWh or less, the average-sun rule then covered 1 to 8% less distance than the last-week rule, and no tuning of the target or the correction fixed it.

The suspect was one line of the rule. If the day's expected power is below the payload's draw, the boat holds station. Average sun is smooth, so at 50 W it sits below the payload for whole seasons: on 78% of the test days in this run. During those seasons the boat never moves, however full the battery is.

We wrote five predictions down, then tried a lower threshold: hold station only when expected power is below 75%, 50%, 25% or 0% of the payload. We ran the same 12 boats (2.5 to 20 kWh packs, 10 to 50 W payloads), tuned on 2015 to 2019 NASA POWER sunlight at 30 ocean points and scored on 2020 to 2024.

What came out:

- **The gate does cost distance.** Lowering it adds 0.5 to 2.0 points of distance at 50 W, more on bigger packs. With a 10 or 20 kWh pack the average-sun rule now beats the last-week rule on both distance and payload downtime (it did at 20 kWh only before).
- **On small packs it isn't enough.** At 2.5 and 5 kWh the rule still covers only 93% and 96% of the last-week rule's distance.
- **Anything below 75% does the same as 75%.** At 50 W, thresholds of 0.5, 0.25 and 0 give exactly the same distance as 0.75 in every cell. The algebra explains it. Without the gate, the boat moves only when expected power plus the battery correction beats the payload draw, and the correction can add at most half the pack spread over the feedback time. That's under 1 W on a 2.5 kWh pack and about 42 W at most on a 20 kWh one. A day whose average sun is far below the payload stays put either way.
- **Even light payloads pay a little.** At 10 W with a 20 kWh pack, dropping the gate adds 0.8% distance. We predicted it would matter there by less than 0.5%.

Two of five predictions held.

For a designer the practical change is simple: drop the gate and let the battery correction decide when to move. It was never worse than the 75% gate by more than 0.11% distance in any of 48 cells, and it's one fewer parameter. Small packs under heavy payloads need something else. The likely reason, which we haven't tested yet, is that the last-week rule moves on the sunny weeks inside a dull season, and an average-sun rule averages those weeks away. The next step tries an estimate that keeps both.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. There's one five-year tuning window and coarse grids, and the packs and payloads are a sweep, not real vehicles. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zr).
