---
title: "Minimum night flow misses the small leaks on BattLeDIM"
seo_title: "Minimum night flow (MNF) leak detection on BattLeDIM L-Town against pressure CUSUM"
date: 2026-11-13
description: "On BattLeDIM, minimum night flow finds 3 of 9 small leaks where pressure CUSUM finds 7. Its night-to-night swing, about 11 m³/h, is as big as the leaks."
tags: [research, water-leaks, leak-detection, BattLeDIM, minimum-night-flow, water-distribution, water-loss]
---

Ask a water-loss engineer how to spot a slow leak and they will usually say: watch the minimum night flow. Between midnight and dawn almost nobody is using water, so the lowest flow into a district is mostly leakage. If it creeps up, something has started leaking. It is the standard tool for leaks too small to show up as a burst.

The [water-leaks programme](/research/water-leaks/) had a hypothesis written down for it: on the BattLeDIM L-Town benchmark, minimum night flow would catch the small, slowly growing leaks sooner than a detector watching pressure sensors. This step tested it. The answer was no, and not narrowly.

L-Town's inflow is easy to balance. Two metered pipes bring water in from the reservoirs. A pump lifts some of it into a tank that drains back into the same network, so the tank's change in storage has to come off. What is left is the district's use plus its leakage. We took the lowest hour of that between midnight and six each night. A CUSUM watched it against the median of a trailing two-week window, with the threshold picked on 2018 alone, by the same rule as our earlier detectors. The rule and the test were written down before any night-flow figure was computed.

Of the 9 leaks that start in 2019 with a peak under 12 m³/h, the night-flow detector found 3. Our pressure-residual detector found 7, and our blind rebuild of the published LILA method also found 7. Night flow got there first on one leak (20 hours against 71) and later or not at all on six. Across all 19 new leaks it found 10 with 6 false alarms, about what the same number of random alarms would score (a median of 11).

The reason is the noise floor. From one night to the next, L-Town's minimum flow moves by a robust standard deviation of about 11 m³/h. A 5 m³/h leak is half of that. A CUSUM tuned for a half-sigma shift does not drift upward at all for a leak that size, so it is not expected to find it, and it did not. Part of that swing is a weekly pattern. Looked at after the scores were in, Friday and Saturday early mornings run 10 to 15 m³/h above the rest of the week. Taking that out leaves about 7 m³/h, still larger than the smallest leaks.

So on this network the small-leak signal is in the 33 pressure sensors, not in the district meter. Two cheaper fixes are worth one honest run each before the question is closed. One is a weekday-aware baseline. The other subtracts the 82 smart meters' night use, which is what utilities do when they have them. L-Town is a simulated network with simulated leaks, so this says nothing about any real utility's night flow. Code, per-leak tables and the log are in [the project](/research/water-leaks/).
