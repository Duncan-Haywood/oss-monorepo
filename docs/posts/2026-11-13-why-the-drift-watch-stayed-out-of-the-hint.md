---
title: "Why the wandering-level watch stayed out of the alert hint: a pre-registered test that failed"
seo_title: "Changepoint watch hint: adding a drift model lost 2 of 17 marks"
date: 2026-11-13
tags: [changepoint-detection, monitoring, alerting, pre-registration, negative-result]
description: "Pre-registered on 23 real series: adding a drift-model setting to the changepoint watch's alert hint reached 15 future changes against 17. It was quiet for the wrong reason."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can watch a growing series and alert once when it changes. It has four "How eager" settings: Quiet (the default), Middle, Eager, and, since this morning, "Wandering level", a drift model for prices and stock levels that move all the time. A hint button replays your own history under each setting and suggests the most eager one that would have stayed under a budget of 2 alerts per 100 checks, about 7 a year on a daily check.

The hint scored only the first three settings. So the obvious next step was to add "Wandering level" to it. Before running anything, I wrote the rule down and committed it ([`eval/watch-hint-drift.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/watch-hint-drift.mjs)): the drift setting goes between Middle and Eager, and the new hint ships only if it reaches more real changes than the current one, without sending more alerts than Middle or a smaller share of alerts at real changes.

**The test.** 23 real series from the Turing Change Point Dataset, each cut in half. The hint picks a setting from the first half and is scored on the second, against changes most of TCPD's human annotators marked.

| policy | alerts per 1,000 checks | share at a marked change | marked changes reached |
|---|---|---|---|
| hint, three settings (shipped) | 17.5 | 40% | 17 of 31 |
| hint, with "Wandering level" | 15.2 | 39% | **15 of 31** |

It failed: two fewer changes reached. The surprise was which series moved. I expected the wandering ones (CO2 emissions, fertility rates, business inventories) to move to the drift setting. None did. Drift sent 5 to 15 alerts per 100 checks on their histories, far over the budget. The eight series that moved were mostly the *calmest* ones: quality-control charts, airport passenger counts, seat-belt casualties, US population. Drift sent almost nothing on them.

That is the mechanism. On a flat level, a drift model explains a modest step as part of the wander. So it goes quiet because it is less sensitive, not because the series is calm. The hint reads "few alerts on the history" as "room to be more eager" and gets it backwards. Two series, construction spending and seat belts, each lost their one later change that way.

The hint's rule quietly assumes the settings are nested, each more eager one alerting at least as often as the one below. Quiet, Middle and Eager nearly are. Drift is a different model: quieter than Quiet on a flat series, louder than Middle on a wandering one. No single rung on the ladder fits it.

**One lead, not a conclusion.** Used for every series, the drift setting beat Middle on all three counts: 25 of 31 changes against 23, 25.3 alerts per 1,000 checks against 27.3, and 46% of alerts at a marked change against 33%. But these series have been looked at in every round so far, so the next step is a fresh labelled set, not a change to the defaults.

So the hint keeps three settings, the code says why, and a test pins the result. If your series clearly wanders, you can still pick "Wandering level" yourself.

*Statistical estimates from your own data, not financial or professional advice.*
