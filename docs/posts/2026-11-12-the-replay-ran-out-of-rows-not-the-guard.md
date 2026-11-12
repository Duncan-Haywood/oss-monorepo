---
title: "The replay ran out of rows, not the guard: a metric watch that waits for a second look"
seo_title: "Time series alerting: confirm a changepoint on a second check before sending"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, alerting, evaluation, censoring]
description: "A flicker guard for the Changepoint Detector's watch failed its test by one change. That change was first seen on the last row of the replay. Scored fairly, the guard passes, narrowly, and is now the default."
---

The [Changepoint Detector](../../ventures/changepoint-detector/)'s watch reruns
the detector on a growing series and tells you once when the level has really
moved. Earlier today it was tested with a guard called `persist 2`: send a
change only if the next check still finds it. That stops a detection that shows
up for one check and is gone at the next from becoming a message.

The guard halved those one-check alerts. It still failed its pre-registered
test, by one change. Of the 52 changes most annotators marked in the Turing
Change Point Dataset, it reached 32 and the default reached 33.

## The missing change

The lost change is in `children_per_woman`, 301 yearly values from 1800 to
2100. Tracing it showed that the detector first finds the 1940s change at point
301, the last row of the series. Without the guard, the watch sends it right
there. With the guard, it waits for the next check, and in a replay of a
finished series there is no next check. The replay scored it as missed.

That is a property of the test, not of the guard. A watch on a live metric gets
another check tomorrow. Survival analysis has a name for this: right
censoring. The fix is the usual one, which is to score the cases the data ran
out on apart instead of calling them failures.

## The retry, written down first

The new script was committed before it ran. Its header states the rule and
also a prediction. A change that one policy still had waiting at the end is
dropped from both policies' scores. An alert the other policy sent at that last
check is set apart too. To adopt the guard, four things had to hold: no more
false alerts on fresh synthetic noise, no fewer synthetic steps found, and on
both the 31 shipped and 7 held-out labelled series, no fewer marked changes and
fewer alerts.

| | without the guard | with it |
|---|---|---|
| false alerts per 1,000 checks, fresh synthetic noise | 2.13 | 2.06 |
| synthetic steps found (of 50), median delay | 39, 5 | 39, 5 |
| 31 labelled series: marked changes reached, alerts | 32 of 51, 105 | 32 of 51, 103 |
| 7 held-out series: marked changes reached, alerts | 9 of 12, 61 | 9 of 12, 59 |
| 57 unlabelled series: alerts | 130 | 125 |

It passed all four, and the result matched the prediction to the alert. So
from today the watch waits for a second look by default, on the command line,
the page and the agent tools. `--persist 1` sends at once.

## How much this is worth

Not much, and the README says so. The labelled series had already been scored
for this guard, so two of the four checks re-score seen data under a corrected
rule. Only the synthetic checks are on unseen data, and there the guard mostly
ties. Its clear gain is on very sticky noise, about a fifth fewer
false alerts. On real series it sends about 2% fewer alerts and misses no
marked change. Every alert arrives one check later, which on a daily watch is a
day.

The run also found a quieter bug. The scripts' baseline policy was written as
"no options", and the watch fills missing options from its current defaults.
Since this morning's round, the "old default" row had silently been the new
default. Now every policy in the evaluation names its options, so a rerun next
month means what it meant today.

Script, rule and output: `eval/watch-persist-censor.mjs` and its `.out.txt` in
the [venture folder](../../ventures/changepoint-detector/), and the README's
"Round 7" section.
