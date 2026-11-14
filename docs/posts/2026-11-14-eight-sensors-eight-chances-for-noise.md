---
title: "Eight sensors, eight chances for noise: the change watch on 33 real pump faults"
seo_title: "Watching 8 sensors: 33 of 33 pump faults caught, 4x the false alarms"
date: 2026-11-14
tags: [changepoint-detection, monitoring, anomaly-detection, pre-registration, negative-result]
description: "Pre-registered on SKAB's 33 pump faults: the default watch caught all 33, but on a normal run all 8 sensors together sent 8.5 false alerts per 100 checks."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a watch: a scheduled job that re-reads a growing CSV and sends a message when a new change is confirmed. Since yesterday it can watch every column of a sheet at once (`--columns all`). Two earlier rounds tested the watch on the Numenta Anomaly Benchmark (NAB) and ended on the same line: test it on a third labelled set. Today it got one, and the first with labels on several columns at once.

**The data.** The Skoltech Anomaly Benchmark (SKAB) logs 8 sensors of a water-pump testbed once a second: vibration, current, pressure, temperatures, voltage and flow rate. 33 runs each hold one fault made on purpose: a valve closed, a leak, a rotor imbalance, cavitation. Each run marks when the fault started and when it ended. One 2.6-hour run has no fault at all. The rules and predictions were committed before any run printed a score.

**What came out**, in 5-second steps, all 8 sensors watched:

| setting | faults caught | alerts at a marked change | normal run: false alerts per 100 checks |
|---|---|---|---|
| Quiet (default) | 33 of 33 | 36.8% | 8.5 |
| Middle | 33 of 33 | 26.1% | 20.5 |
| Wandering level | 33 of 33 | 25.8% | 9.9 |
| Eager | 33 of 33 | 24.7% | 37.2 |
| the "How eager" hint | 33 of 33 | 28.4% | 9.6 |

By chance, 23.1% of alerts would land near a marked change.

**All three pre-registered rules failed.**

- The "How eager" hint picks a setting for each column from a normal stretch. Here it reached more marked changes than the default (118 of 123 against 97), but a smaller share of its alerts sat on one, more than the 5 points allowed. That makes it unconfirmed on NAB and on SKAB, and the hint's text now says so.
- On NAB, the "Wandering level" setting's alerts landed on anomalies more often than the others did. That did not carry over: here it was barely above chance, at 2.5 times the default's alerts.
- Each column gets the whole alert budget, about 2 alerts per 100 checks. On the fault-free run, the default on all 8 columns sent 8.5. Every one of those was false.

**What to do with it.** A closed valve moves the flow rate so much that every setting caught every fault. The cost of watching more sensors shows up on ordinary days. Watched alone, flow rate caught 29 of 33 faults with a quarter of the default's alerts. The two temperature sensors drift with the room and were the noisiest columns. So the watch's help and page now say: replay a normal stretch first (`--suggest`), see which columns are loud, and keep the ones that matter. A budget for the whole watch is still open. Splitting it across columns would not have helped here, because even the quietest setting was over budget.

Caveats: short runs (about 19 minutes each), 16 near-copies of one valve fault, and SKAB marks faults, not every move a sensor makes. Script, rules and full output are in the tool's README ("Round 12"). The data is GPL and is fetched by a script, not copied here.
