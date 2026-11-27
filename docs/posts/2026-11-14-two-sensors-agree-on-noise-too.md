---
title: "Two sensors agree on noise too: a pre-registered test of 'alert when two columns agree'"
seo_title: "Multi-sensor anomaly alerts: why requiring two columns to agree failed"
date: 2026-11-14
tags: [changepoint-detector, monitoring, anomaly-detection, pre-registration, negative-result]
description: "On a real 8-sensor pump, waiting for two sensors to agree cut false alerts from 4.2 to 2.7 per 100 checks, still over budget, and missed 9 of 33 faults."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [changepoint detector](../../ventures/changepoint-detector/)'s watch can follow several metrics in one CSV
(`watch.mjs --columns all`). Earlier today, round 12 tested that on a real machine. The machine was the Skoltech Anomaly
Benchmark (SKAB), a water-pump testbed with 8 sensors and 33 recorded faults. The result was awkward. On the testbed's
2.6-hour normal run, the default Quiet setting on all eight sensors sent 8.5 alert lines per 100 checks, every one of
them false. The budget is 2.

The usual fixes do not apply. Quiet is already the least eager setting, so splitting the budget across columns has
nowhere left to go. Dropping the loudest columns would have kept pressure, voltage and current, which caught no fault on
their own, and could have dropped flow rate, which caught 29 of the 33.

## The rule we tested

A textbook fix for many sensors is to wait for agreement. Send a message only when at least two sensors date a change
within 60 seconds of each other. Noise in two independent sensors rarely lines up. A real fault usually moves more than
one reading.

We wrote the rule, the scoring and our predictions down and committed them before running anything that printed a score
(`eval/watch-skab-agree.mjs`). The baseline is the same alert lines merged into one message per change, so both sides
are counted the same way. To pass, the agreement rule needed all three of these:

1. at most 2 messages per 100 checks on the normal run;
2. no more than 2 fewer faults caught than the baseline;
3. at least the baseline's share of messages near a labelled event.

## What happened

| every sensor on Quiet | messages on 33 fault runs | near a labelled event | faults caught | normal run, per 100 checks |
|---|---|---|---|---|
| one message per change | 238 | 31.5% | 31 of 33 | 4.19 |
| two sensors agree | 129 | 37.2% | 22 of 33 | 2.69 |
| three sensors agree | 52 | 46.2% | 12 of 33 | 1.13 |

It failed two of the three parts. The normal run still sent 2.69 messages per 100 checks, and the rule missed 9 faults
the baseline caught. Its messages did land nearer the faults (37.2% against 31.5%). As pre-registered, the option does
not ship. The `--columns` help and the [watch page](../../ventures/changepoint-detector/watch-a-metric-for-changes.html)
now say what was tested and why it is not offered.

## Why

The false messages that got through came mostly from sensors that move together. The two accelerometers completed 8 of
the normal run's 50 messages. Accelerometer 1 with flow rate completed another 8, and the thermocouple with flow rate 7.
On a real machine the columns are physically coupled, so their noise is coupled too. Independence is exactly what the
rule assumes.

The rule also gives up the faults one sensor sees best. A closed inlet valve moves the flow rate sharply, and the other
sensors often stay quiet within the minute. The agreement rule caught 8 of those 16 faults; the baseline caught 14.

A synthetic check would have missed all of this. On five independent noise columns, Quiet sent one alert line in 2,400
checks, so every rule looked perfect there. Only the real normal run could tell the rules apart.

## What next

Agreement may still work across sensor groups that measure different things, if the person setting up the watch names
the groups. Another option is a cap per column, learned from a normal stretch. Neither has been tested. Until then the
advice stands: replay your history with `--suggest` and watch the columns that matter.

Full numbers: the venture README, "Round 13". SKAB is GPL-3.0 (Katser and Kozitsin 2020), so it is fetched by script
and not committed here.
