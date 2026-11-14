---
title: "A solar boat that checks its own sun forecast wins in 46 of 56 cases"
seo_title: "Self-tuning solar USV battery feedback from a harvest ratio"
date: 2026-11-14
tags: [research, marine-hull]
description: "A solar survey boat that compares its last 60 days of harvest with its sun climatology, and sets its battery feedback from the ratio, beats the plain 7-day rule in 46 of 56 biased-climatology cases."
---

The [last step](2026-11-14-marine-hull-solar-boat-climatology-bias-window.md) found a catch in a solar boat's speed rule. The boat plans each day's speed from a blend of two sun estimates: the average sun for that day of the year (the climatology) and its own last week of harvest. It closes any gap to its battery target over a set number of days, the feedback time. That blended rule beats the plain 7-day rule only when the climatology is roughly right. The best feedback time depended on how wrong the climatology was: about 60 days if it understates the sun, 30 if it is honest, 20 or 10 if it overstates it.

A boat at sea does not know how wrong its climatology is. It does know two numbers every day: how much it harvested and how much the climatology promised. So this step gave the boat one more line of logic. It divides its last 60 days of harvest by the climatology's promise for the same days, and picks the feedback time from last step's table using that ratio. We wrote seven predictions down before running anything, then scored the rule on the same 56 cases: climatologies scaled from 0.97 to 1.03, two five-year halves of 2015 to 2024, four battery sizes from 2.5 to 20 kWh, 30 ocean points and a 50 W payload.

What came out:

- **The self-tuning rule wins almost everywhere.** It goes at least as far as the 7-day rule with no more payload downtime in 46 of the 56 cases, and in at least 5 of 8 at every bias. The two best fixed rules from earlier steps managed 30 and 36. A 90-day window did slightly better, at 48.
- **It beats the oracle.** A rule told the true bias of each case, and fixed to the matching feedback time, won 44. Our reading is that the boat's own ratio also tracks local, seasonal luck at its point, which a single bias number for a whole case cannot. That is a reading, not a test.
- **Don't use the ratio to fix the forecast.** Scaling the climatology term by the same ratio sounds more direct. It made things worse: 24 of 56. The boat went 7 to 21% further than the 7-day rule but ran its battery flat more often. Doing both together was worse still, at 12.
- **The ratio is a little timid.** Averaged over a whole case, the boat's estimate of the bias landed within one point of the truth in 12 of 14 settings. It is pulled toward "no bias" by a 14-day starting assumption and by restarting each January.

Four of the seven predictions held. The three that failed: correcting the forecast would help (it hurt), a 60-day window would beat 30 and 90 (90 was best), and the bias estimate would be within one point everywhere (it missed twice, by up to 1.4 points).

For anyone building a solar boat's energy manager, the practical result is that the boat can audit its own sun forecast. The boat needs a running ratio of what it harvested to what the forecast promised over the last two to three months. It should use that ratio to choose how fast to correct its battery, not to rescale the forecast.

One caution matters more than the rest. The feedback table was read from these same 56 cases last step, so this shows that an on-board estimate can realise the table, not that the table holds on new data. Testing the frozen table on years and points it has not seen is the next step.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The bias is one uniform factor, while real climatology errors vary with season. The battery and payload sizes are a sweep, not real vehicles. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zw).
