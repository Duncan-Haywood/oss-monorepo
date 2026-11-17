---
title: "A metric watch that stops alerting about the past: a pre-registered fix for one-check blips"
seo_title: "Time series change alerts without false alarms on old history"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, alerting, monitoring, pre-registration]
description: "The metric watch no longer alerts on changes dated inside history it called quiet: 9 of 115 alerts gone on 31 labelled series, no marked change lost."
---

The [Changepoint Detector](../../ventures/changepoint-detector/) has a watch:
run it after each new row of a daily metric and it tells you, once, when the
series has changed for good. Its first run records the changes already in your
history as a baseline, so you are not paged about 2019 on day one.

Earlier today a replay of the watch over finished series found a hole in that.
On `ausair` (yearly Australian air passengers, 47 rows) the first check, at 20
rows, sees no change. One row later the engine briefly finds two changes, at
1979 and 1985. Both already have five rows after them, so the watch sent both
alerts about history it had just called quiet. One row after that, both
detections were gone.

## Two guards, one rule, written down first

Two fixes were candidates:

- **hold**: a change dated where the first check already had five rows after it
  is recorded as *held*, never alerted;
- **persist 2**: a change is sent only if it was also there at the previous
  check, so a one-check blip never goes out, at the cost of one check of delay.

Before running anything we committed the rule that would decide
(`eval/watch-flicker.mjs`, header). A guard replaces the current behaviour
only if it has no more false alerts on four kinds of synthetic noise, finds at
least as many synthetic steps with at most two points more delay, and, on the
31 labelled series of the Turing Change Point Dataset, reaches at least as
many changes that most annotators marked while sending fewer alerts.

## What happened

| policy | alerts on 31 labelled series | changes most annotators marked, reached |
|---|---|---|
| alert at once (old) | 115 | 33 of 52 |
| **hold (new default)** | **106** | **33 of 52** |
| persist 2 | 112 | 32 of 52 |
| both | 103 | 32 of 52 |

*hold* passed and is the default now, in the command-line watch, the page's
"Keep watching a series" card, the history replay and the agent tools. It
changed nothing on the synthetic streams (their history is long, so the guard
never fires) and took 9 alerts off six real series without losing a marked
change. *persist 2* halved the one-check blips but lost one marked change, so
it failed its own rule and stays an option (`--persist 2`). On `ausair` the
replay now sends one alert, for the 1991 rise, instead of three.

## Checked on series no watch round had seen

TCPD has seven univariate series it does not ship in its repository; the tool
fetches them separately and checks their checksums, and no watch decision had
ever used them. On those, *hold* cut alerts from 68 to 61 and reached the same
9 of 12 marked changes. The same run checked an earlier choice: capping the
autocorrelation estimate at 0.8 (round 4, chosen on the 31 shipped series).
Capped, the watch reached 9 of 12; uncapped, 6. The cap held on fresh data.

The honest caveat is in the same table. Without the autocorrelation term the
watch reached all 12 of those marked changes, at 161 alerts instead of 68. The
default is the quiet one, and on a series like measles counts it still sends 20
alerts with no annotated change behind them. That is why the page lets you
replay the watch on your own history before you trust it, and why choosing how
eager the watch is per series, from that replay, is the next thing to build.

The code is MIT licensed and runs in your browser or your own GitHub
repository; nothing is sent to us. Statistical analysis of data you supply,
not advice.
