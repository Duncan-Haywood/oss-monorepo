---
title: "A solar survey boat on one battery for a year: where the payload goes dark"
seo_title: "Year-long solar USV mission: payload downtime by latitude, 2024 data"
date: 2026-11-12
tags: [research, marine-hull]
description: "One 10 kWh pack through all of 2024: a 4 m solar survey boat keeps its 30 W payload on all year within 20 degrees of the equator, and loses it for 3 to 7 months poleward of 40."
---

The [month-by-month map](2026-11-12-wave-glider-or-solar-boat-month-by-month.md) said a 4 m solar-powered survey boat out-travels a 2015 Wave Glider in the tropics and loses to it in the winter storm belts. It got there with two shortcuts. In one version the boat ran only on each month's average sunlight, and when that fell short of the payload's 30 W it was simply scored "0 km/day". In the other it started every month with a full battery, which in practice means a port call every month.

A real year-round survey line has neither. So this step carried one 10 kWh pack through all 366 days of 2024 from a 1 January launch, at 30 points: two ocean meridians (150 W and 30 W, every 10 degrees from 60 S to 60 N) and five coastal survey sites. It used the same NASA POWER daily sunlight as before. The payload came first. On any day the battery plus that day's sun couldn't power the sensors for 24 hours, we counted the day as "down", meaning the payload went dark. The boat was run two ways: with a simple speed rule that only looks back at the last week's sun, and with a plan that knows the whole year's weather in advance. Nine predictions were committed before the run.

What came out (seven of nine predictions held):

- **In the tropics, nothing changes.** Within 20 degrees of the equator the payload never went dark, and the simple rule covered 27,000 to 39,000 km in the year. That is 1.25 to 1.86 times the Wave Glider's best-case year.
- **At 30 degrees it's a tie.** Distance came out even with the Wave Glider (0.97 on average), and the payload was dark for 13 to 76 days under the simple rule.
- **From 40 degrees poleward, the payload is off for 3 to 7 months.** Even with perfect knowledge of the weather, the boat lost its payload on 77 to 214 days a year.
- **It isn't the boat's fault.** A vehicle with the same deck panel (1.15 m²), battery and payload that never moves at all goes dark on exactly the same number of days, at all 30 points. At high latitude the limit is the power system, not the hull.

That last result changes the question a planner should ask first. At 40 degrees or higher, before choosing a hull, ask how much payload power a year of that sun can carry. For this panel and pack, the answer with no dark day is 54 W at the equator, about 31 W at 30 degrees, 17 to 22 W at 40, 10 to 13 W at 50 and 8 to 9 W at 60. Doubling the pack to 20 kWh ends the dark days at 30 degrees but not further north.

Two predictions failed. We expected the look-back rule to get within 15% of the all-knowing plan wherever neither went dark; at Florida it got 81%, because it holds still through winter weeks the battery could have covered. We also expected the year-long run to match the earlier month-by-month numbers within 5%. That held only in the tropics. Further north the old "average sunlight" shortcut overstated a year's distance by up to 2.4 times, and the "full battery every month" version by up to 5 times.

One more finding came after reading the results, so we've labelled it as found after the fact. At three far-north points the all-knowing plan covers *less* distance than the simple rule, 0 km against 2,286 at 50 N in the Pacific. It's right to. There the battery never refills between the summer surplus and the autumn shortfall, so every metre the boat moves in summer is sensor time lost in October.

The caveats: the boat is modelled in calm water, with daily energy steps, over one year. The same caution now hits the Wave Glider side harder: its sensors run on solar panels too, and that budget isn't modelled yet, so its lead at high latitude says nothing about whether its payload stays on. That comparison is next. The code, the pre-registered predictions and the results are in `research/marine-hull/` (milestone 6zj).

*Written with AI assistance (Claude Code).*
