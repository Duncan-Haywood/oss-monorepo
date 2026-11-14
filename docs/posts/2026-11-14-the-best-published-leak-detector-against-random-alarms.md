---
title: "The best published L-Town leak detector, scored against random alarms"
seo_title: "SICAMS on BattLeDIM 2019: published leak detection times vs chance"
date: 2026-11-14
description: "SICAMS's published 2019 times find 13 of 19 BattLeDIM leaks; 27 random alarms find 10 (P = 0.057). Run automatically, it gives 26 false alarms."
tags: [research, water-leaks, leak-detection, BattLeDIM, Hotelling, pelt, water-loss]
---

The [water-leaks programme](/research/water-leaks/) has spent twelve steps asking one question about the BattLeDIM L-Town benchmark: how much of a leak detector's score is above what random alarms would get? L-Town has 19 new leaks in 2019, many running for weeks, so a 30-day matching window covers a lot of the calendar. Our own detectors and our reimplementation of LILA landed at or near chance on the count of leaks found. They did clearly better on *where*: the alarming sensor was close to the leak.

That left an obvious objection. Those were our detectors. What about the best published one?

**The paper.** SICAMS (Melnikov 2025, [arXiv:2512.15685](https://arxiv.org/abs/2512.15685)) whitens the sensor vector using each hour's training covariance and tracks Hotelling's T², with PELT change points on top. It reports 69.6% true positives and one false alarm on BattLeDIM 2019, ahead of the competition's best teams. Earlier sessions could not reach arXiv. This one could, and the paper's appendix lists a detection time for every leak.

**Its own times, on our harness.** We fed those published times in as alarms and scored them exactly as we score everything else: 30-day greedy match, and chance from 1,000 sets of the same number of alarms at random hours.

- Table 1's times alone: **13 of 19 at 27 alarms; random alarms find a median 10 (95% range 6 to 13); P = 0.057.**
- With the paper's one stated false alarm added as an alarm: 14 of 19, P = 0.026. That extra alarm falls inside a different leak's 30-day window and counts as a hit.
- Within 72 hours of onset: 9 of 19, against a chance median of 2 (P < 0.001).

So one alarm moves the count across the 0.05 line, while the speed at which it catches the abrupt leaks is plainly real. We get 13 rather than the paper's 14 because of the matching rule: our greedy match credits the p721 alarm to p800, which started later and was still inside its window.

**Run automatically.** The paper picked its training periods by hand and retrained one district by hand before two leaks. It also does not give its PELT penalty. We fixed all of these by rule and tuned the free settings on 2018 only. The rule picked a setting with one false alarm in 2018. In 2019 the same setting found **13 of 19 with 26 false alarms; 48 random alarms find a median 14 (P = 0.82).** The false alarms cluster at 02:00 to 04:00 every few days from September. As leaks pile up, the statistic's daily swing grows, and a penalty tuned on a quieter year cuts it into pieces. Where the automatic version does beat chance is location: for 5 of its 13 detections the alarming sensor is within 300 m of the leak, where chance gets a median of 0.

**What it says.** All four predictions written before the run held, one of them only as specified. On L-Town, a detection-only count is a weak way to rank methods. A published entry's own times sit at the edge of chance on that count. Timeliness and location carry the signal. The jump from 1 false alarm to 26 also makes the case for the programme's next milestone: an alarm threshold whose false-alarm rate is fixed on leak-free operation (simulated L-Town years), not tuned on one year and hoped for on the next.

L-Town is a simulated network with simulated leaks; nothing here is an operational recommendation. Code, the pre-registered plan, the per-leak results and the figure are in [the project](/research/water-leaks/), step 13.
