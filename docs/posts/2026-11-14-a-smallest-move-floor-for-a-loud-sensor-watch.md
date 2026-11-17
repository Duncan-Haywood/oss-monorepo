---
title: "Ignore moves smaller than X: a floor per sensor cut false alarms by two thirds, and missed its bar anyway"
seo_title: "Sensor alert floors: false alarms 6.3 to 2.3 per 100 checks on SKAB"
date: 2026-11-14
tags: [changepoint-detection, monitoring, anomaly-detection, pre-registration, negative-result]
description: "Pre-registered on SKAB's 33 pump faults: a per-sensor floor read off a normal run cut false alerts from 6.34 to 2.27 per 100 checks, but lost 5 faults."
---

The [changepoint detector's](https://marisstella.app/changepoint-detector/) watch can keep an eye on every column of a sheet at once. On a real eight-sensor water-pump testbed (the Skoltech Anomaly Benchmark, SKAB) that was too loud: on a normal run with nothing wrong, the quiet default sent 8.5 false alert lines per 100 checks, over four times its budget. The last two tests (a budget split, and waiting for two sensors to agree) did not fix it.

Today's test was the answer an operator would give: "don't tell me about moves smaller than X." The watch read X for each sensor off the normal run, as the size that leaves at most four of that run's alerts. Then it was scored on the 33 fault runs, using only the normal stretch before each fault. Those stretches were recorded on other days, so it is an honest out-of-sample test.

| every sensor on Quiet | false lines before the fault, per 100 checks | faults caught | alerts at a fault mark |
|---|---|---|---|
| no floor | 6.34 | 33 of 33 | 36.8% |
| floor from the normal run | 2.27 | 28 of 33 | 46.5% |

So the floor removed two thirds of the false alerts, and the alerts it kept pointed at faults more often. But the rule written before the run asked for at most 2 false lines per 100 checks and no more than 2 faults lost. It missed both, so the automatic floor does not ship.

The reason is simple. An equal share of the budget per sensor floored the flow-rate sensor, which sees the faults, as hard as the thermocouple, which sees almost none. Flow rate alone went from 29 faults caught to 18. The temperature floor, read off one normal day, also did not carry over to the other days' runs.

What did ship is the hand-set version: `--min-shift temperature=0.5` drops moves smaller than half a degree in that column. The floor is applied inside the watch, so a fault that starts small still gets through once it grows (28 faults caught, against 22 when the same floors were applied after the fact). The practical advice: put floors on the loud columns you don't care about, and leave the one that sees the problem alone.

The script, the rule, the predictions and the full tables are in the tool's README, "Round 14". SKAB is GPL, so it is fetched, not committed.
