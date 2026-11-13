---
title: "Run the years backwards: the solar boat's speed rule keeps its settings, not its margin"
seo_title: "Solar USV speed rule on held-out years: settings hold, margin slips"
date: 2026-11-13
tags: [research, marine-hull]
description: "Tuned on 2020 to 2024 and flown on 2015 to 2019, a solar boat's blended speed rule keeps its settings and range but overspends where the climatology runs sunny."
---

The [last step](2026-11-13-marine-hull-solar-boat-blend-weight-across-oceans.md) ended with a rule we had read off the results rather than tested. A small deck-solar survey boat whose 50 W payload draws more than the deck harvests on an average day plans each day's speed from a mix of two sun estimates: the average sun for that day of the year, and its own last 7 days of harvest. It closes any battery error over a set number of days. The rule scaled with the battery: half and half with a 60-day correction for a 2.5 kWh pack, half and half with 30 days for 5 kWh, and three-eighths last-week with 30 days for 10 and 20 kWh. On the years we read it from (2020 to 2024) it beat the plain 7-day rule on both distance and payload downtime in 12 of 12 cases. That is an in-sample result.

So we ran time the other way. The day-of-year sun averages now come from 2020 to 2024 only, and the boat flies 2015 to 2019. The rule is scored unchanged, with no tuning, over all 30 ocean points and over the Atlantic and Pacific halves. We wrote seven predictions down and committed them before running anything.

What came out:

- **The settings reproduce exactly.** Tuning on 2020 to 2024 picks the same weight and the same correction time at every battery size as the rule we read off the old test tables. The weight still follows the payload: about 0.09 for a 10 W payload, 0.13 for 30 W and 0.44 for 50 W.
- **The distance carries over, and then some.** The rule goes 11 to 16% further than the 7-day rule in every region and battery size, more than the 2 to 12% it managed on 2020 to 2024.
- **The downtime margin does not.** It keeps the payload at least as lit as the 7-day rule in all four Atlantic-and-coastal cases, but in only one of four Pacific-and-coastal cases, where it spends 1.14 to 1.22 times the downtime. Four of seven predictions held. The three that failed are the ones saying it wins on both counts.

Why the Pacific? After scoring, we checked how sunny each window was against the average it planned with. On this split the Pacific-and-coastal years were 1.4% dimmer than their climatology, and the Atlantic ones 0.2% dimmer. On the old split it was the other way: the flown years were 1.4% and 0.2% sunnier. A rule that leans on the average sun overspends when the average promises more than arrives. The 7-day rule never looks at the average, so it does not care.

The fix in the tables is not the one we suggested last time. Taking less weight on last week did not reliably buy the margin back. A shorter correction did: 20 days instead of 30, or 30 instead of 60 on the smallest battery, with the same weights. That version beat the 7-day rule on both counts at every battery size, going 7 to 8% further with 0.74 to 0.86 times the downtime. It costs 4 to 8 points of distance against the longer correction. That too was read off the results, so the next step is to test it on purpose: bias the climatology by 1 to 3% either way and see which correction time holds.

For a designer, the plain reading is this. The blended rule's weight and correction time are stable from one five-year window to the next. Its spare battery comes from trusting the climatology, so if you cannot vouch for that, shorten the correction.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The climatology for 2015 to 2019 comes from later years, so this is a check that the weather is stable over the decade, not a forecast. Batteries and payloads are a sweep, not real vehicles. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zu).
