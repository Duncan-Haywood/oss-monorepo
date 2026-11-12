---
title: "When stickiness hits its limit, a metric watch goes deaf: capping rho in a changepoint alert"
seo_title: "Why an autocorrelation-aware change alert misses real changes"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, autocorrelation, alerting, bayesian]
description: "15 of the 17 real changes our metric watch missed came from one place: rho stuck at 0.95. Capped at 0.8, it reaches 33 of 52 marked changes, not 29."
---

Earlier today the [Changepoint Detector](../../ventures/changepoint-detector/)'s
metric watch, the part that runs after each new row and messages you once when
a series changes, switched to a quieter default. It adds an AR(1) term to the
Bayesian detector, so sticky noise (today's value leaning on yesterday's) no
longer looks like a stream of changes. On synthetic AR(1) 0.8 noise, false
alerts fell from 32 to 1.5 per 1,000 checks.

That came at a cost on real data. Replayed one point at a time over the 31
univariate series of the Turing Change Point Dataset, the new default reached
29 of the 52 changes most human annotators marked. The plain detector reached
38. The write-up blamed "short smooth series" without checking. This run checked.

## Where the misses were

The diagnostic replays both detectors and records the rho the AR(1) pass used
at every check. Of the 17 marked changes the plain pass reaches and the AR(1)
pass does not, **15 were confirmed at a check where rho sat at 0.95**, the
upper clip of the engine's estimator. The changes the AR(1) pass does reach had
a median rho of 0.48.

The series at the clip are the wandering ones: Brent crude (4 marked changes,
all 4 reached by the plain pass, none by the AR(1) pass), CO2 emissions in
Canada (4 against 1), children per woman (2 against 0), business inventories.
On 20 of the 30 series long enough to watch, rho is at the clip from the first
check. At rho 0.95 the model expects each point to sit almost exactly on the
last, so a genuine jump reads as one more wobble of a persistent process.

So the obvious fix, freezing rho at the value seen at the start, was dead
before it ran: on those series the start is 0.95 too.

## Round 4: a cap

The rule was committed before the run: cap rho at 0.8 or at 0.5. A cap becomes
the default only if (a) synthetic false alerts on four null streams rise by at
most 1 per 1,000 checks, (b) it finds as many synthetic steps, and (c) it
reaches more marked changes on the real series without a lower share of alerts
at a mark (5 points of slack). The first three rounds left the real series out
of the rule. This one counts them, because the fault only shows on real data.

| rho | false alerts, AR(1) 0.8 | false alerts, AR(1) 0.95 | synthetic steps | real alerts | at a mark | marked changes reached |
|---|---|---|---|---|---|---|
| as estimated | 0.25 | 1.25 | 36 | 103 | 38% | 29 of 52 |
| **capped at 0.8** | 0.00 | 3.00 | 36 | 115 | 41% | 33 of 52 |
| capped at 0.5 | 15.0 | 27.3 | 37 | 169 | 39% | 41 of 52 |

The 0.8 cap passed all three parts and is now the default. It costs something
only on noise that really is that sticky: AR(1) 0.95 noise with no change went
from 1.25 to 3 false alerts per 1,000 checks. The 0.5 cap reaches 41 of 52, but
it alerts 15 to 27 times per 1,000 checks on very sticky noise, so it is an
option (`--rho-cap 0.5`), not the default.

On the series that ship with the tool, the capped watch now reports the S&P
500's October 2008 fall and Canada's 1946 fertility rise. The uncapped estimate
read both as persistence. Both are unit tests now.

## What it does not settle

Because the real series helped choose the rule, 33 of 52 is no longer a
held-out number. The next honest test is labelled series from outside the
dataset. The plain detector's remaining lead (38) sits on series whose level
wanders all the time. A model built for that, the tool's random-walk level
model, may be a better watch for them than any rho.

Script, rule and full output: `eval/watch-rho.mjs`,
`eval/watch-rho-why.out.txt` and `eval/watch-replay-round4.out.txt` in the
venture's folder. The watch itself is MIT licensed and runs in your own GitHub
account; see [Watch a metric for changes](../../ventures/changepoint-detector/watch-a-metric-for-changes.html).
