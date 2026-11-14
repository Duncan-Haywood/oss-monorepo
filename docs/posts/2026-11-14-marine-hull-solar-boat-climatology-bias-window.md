---
title: "Lie to the solar boat about the sun: its speed rule wins only inside a 3-point window"
seo_title: "Solar USV speed rule vs sun climatology bias: a 3-point window"
date: 2026-11-14
tags: [research, marine-hull]
description: "Biasing a solar boat's sun climatology by -3% to +3%: its blended speed rule wins only inside a window, and the right feedback time shortens with optimism."
---

The [last step](2026-11-13-marine-hull-solar-boat-blend-rule-reversed-years.md) left a hunch. A small deck-solar survey boat with a 50 W payload plans each day's speed from a blend of two sun estimates: the average sun for that day of the year (the climatology) and its own last 7 days of harvest. It closes any battery error over a set number of days, the feedback time. Flown on years about 1% dimmer than the climatology promised, the blended rule overspent its battery, and a shorter feedback seemed to fix it. That came from two five-year windows, read after the fact.

So this time we lied to the boat on purpose. Each five-year half of 2015 to 2024 plans with the other half's climatology, and we scaled that climatology by 0.97 to 1.03 before the boat saw it. Everything the boat plans from moves with it, including the battery target the plain 7-day rule steers to, so every rule gets the same wrong information. We scored 56 cases (7 biases, 2 halves, 4 battery sizes from 2.5 to 20 kWh) over 30 ocean points, and wrote seven predictions down before running anything.

What came out:

- **It is a window, not a safety margin.** The blended rule beats the 7-day rule on both distance and payload downtime only inside a band of bias about 3 to 4 points wide. Tell it the sun will be weaker than it is and it gets too cautious: the 7-day rule goes further, by up to 8%. Tell it the sun will be stronger and it spends battery it will not get back, and the payload goes dark more often.
- **The right feedback time follows the bias.** In all 8 (half, battery) series, the longest feedback time at which some blend still wins shrinks as the climatology gets more optimistic: about 60 days when the climatology understates the sun by 2%, 30 days when it is honest, 20 days when it overstates by 1 to 2%, and 10 days or nothing past about 2.5%.
- **Shorter feedback slides the window; it does not widen it much.** The longer-feedback rule wins between about 0.97 and 1.00 times the real sun, the shorter one between 0.98 and 1.02. So last time's advice, "shorten the feedback", is right when the climatology may run sunny and wrong when it runs dim. On a pessimistic climatology the shorter rule loses distance to the plain 7-day rule.
- **The bias decides, not the years.** The two halves start with opposite real biases (the later years were 1.1% sunnier than the earlier half's average, the earlier years 1.1% dimmer than the later half's). Match the cases by effective bias and they agree on which rule wins in 15 of 16 pairs, and on the safe feedback time to within one grid step in all 16. We chose that pairing after seeing the results.

Three of the seven predictions held. Three of the four that failed assumed a biased climatology hurts in only one direction. The fourth assumed the plain 7-day rule ignores the climatology; it does not, because its battery target is built from it, and its distance moved by up to 7% across the biases.

For anyone designing a solar boat's energy manager, the plain reading is this. A blended sun estimate is worth having, but its battery feedback should be set from how far you trust the climatology, not tuned once and left alone. If the boat can tell how far the climatology is off, for instance from a trailing ratio of its real harvest to the average, it could pick its feedback time from that. Testing that self-correcting rule, pre-registered, is the next step.

Limits: simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The bias here is one uniform factor, while real climatology errors vary with season and ocean. The battery and payload sizes are a sweep, not real vehicles. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zv).
