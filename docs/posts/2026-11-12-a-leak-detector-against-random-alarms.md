---
title: "A water-leak detector against random alarms on the BattLeDIM benchmark"
seo_title: "BattLeDIM leak detection: how much beats chance?"
date: 2026-11-12
description: "On the BattLeDIM L-Town benchmark a pressure-residual detector finds 13 of 19 new leaks. Random alarms find 11. Where it does beat chance is location."
tags: [research, water-leaks, leak-detection, BattLeDIM, water-distribution, changepoint]
---

BattLeDIM is the one public leak-detection benchmark with a realistic water network: L-Town, 33 pressure sensors and three inlet flow meters logged every five minutes for two years, and the true schedule of every leak. An earlier project here, [infra-waterloss](/research/infra-waterloss/), wanted it and could not download it, so it used a small textbook network instead. This week the data host answered, so we opened a [research programme](/research/water-leaks/) on the real data.

The first step was a plain detector with no hydraulic model. Each pressure sensor gets a regression on time of week, tank level and inlet flow, fitted on a two-week window that ends a week back. A CUSUM watches each sensor's leftover pressure for a sustained drop. Tuned on 2018 alone, it found 13 of the 19 leaks that start in 2019, with 2 false alarms. That looks respectable next to the published results, which find 43 to 74% of the year's 23 leaks.

Before believing it, we asked what the same 26 alarms would score if they were placed at random. L-Town's 2019 has 23 leaks, many running for months, and a 30-day matching window covers a lot of the calendar. Over 1,000 random draws, the median was 11 of 19 and the 95% range ran from 8 to 13. The detector's 13 sits at the top of that range, with a 10% chance of a random draw doing as well. Counting detections alone barely tells this detector apart from luck.

Location did tell them apart. For 5 of the 13 leaks it found, the sensor that raised the alarm was within 300 metres of the leak along the pipes. The competition used the same 300 m rule. Random sensors managed a median of 0, and none of the 1,000 draws reached 5. So the detector's signal is real, but the score that shows it is the location-aware one, not the count.

The run also turned up a bug. The first version paused for a week after each alarm, and a unit test showed the same leak then alarmed a second time. The fix costs the detector two weeks of blindness after each alarm, and it shows: the year's second big burst started nine days after the first and was caught six days late. The log records the change, made after an earlier version had already been scored on 2019.

The programme's next step is to rebuild two published detectors on the same harness and give each a chance level. After that comes a detector whose false-alarm rate is set before the year is seen. L-Town is a simulated network with simulated leaks, so none of this is a field result. The code, data checksums and full per-leak table are in [the project](/research/water-leaks/).
