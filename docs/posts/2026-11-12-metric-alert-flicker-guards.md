---
title: "A metric alert that pinged about last decade: two guards against flicker, tested before they shipped"
seo_title: "Stop metric alerts about old data: changepoint watch flicker guards"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, alerting, monitoring, pre-registration]
description: "A daily metric watch alerted about history it had just called quiet. Two pre-registered guards removed every such alert on 57 real series."
---

The [Changepoint Detector](../../ventures/changepoint-detector/)'s daily watch
has one job: when a metric shifts for good, tell you once. On its first run it
records the changes already in your history as the baseline and says nothing
about them. The new replay feature showed that this was not enough. On
Australian air passengers (47 yearly points), the first check at 20 points saw
nothing. At 21 points the engine read changes at 1979 and 1985, and the watch
alerted on both, the day after it had called that history quiet. A point
later both were gone.

That is flicker. Re-reading an estimate as data arrives is normal for a
changepoint detector. For an alert it is noise, because no one wants a
message about a ten-year-old change that the tool then takes back.

## Two guards

- **Hold history.** After the first check, a change dated where that first
  check could already have confirmed it is recorded and not alerted. The
  check's notes still mention it.
- **Persist 2.** A change is alerted only if the previous check also found
  it. A step that builds up its five confirming points was already visible
  while pending, so it is not delayed. Only a change that appears out of
  nowhere waits one more day.

## The rule came first

The watch's earlier four rounds worked the same way: the decision rule was
committed before the first run, and the run then picked the setting. A guard
had to keep false alerts on four noise models no higher (fresh seeds), find
as many synthetic steps with at most a point more delay, and on the 31
labelled series of the Turing Change Point Dataset send fewer alerts, reach
the marked changes (at most one fewer) and keep the share of alerts that land
on an annotated change. Then the run.

| guard | labelled-set alerts | at an annotated change | marked changes reached | alerts about pre-baseline history |
|---|---|---|---|---|
| none | 115 | 41% | 33 of 52 | 9 |
| both guards (new default) | 103 | 43% | 32 of 52 | 0 |

All three candidates passed, and the combination won on the fewest alerts.
It is not free: persist 2 loses one marked change, and hold history alone
keeps all 33. The rule allowed one, and finding out which change it was is
the next job. Two checks that decided nothing went the same way. On seven
held-out labelled series that no watch round had used, alerts fell from 68
to 59, with 9 of 12 marked changes reached either way. On 57 unlabelled real
series, all 11 alerts about pre-baseline history disappeared.

The page's two eagerer settings keep their promises with the guards on. The
eager setting still reaches 52 of 52 marked changes (626 alerts down to 602).
A side effect: the replay that checks every few points now matches the
every-point replay on 93% of alerts, up from 85%, because flicker was most of
the gap.

The guards are on by default on the page, in the CLI (`--no-hold-history`,
`--persist 1` turn them off) and in the agent tools `watchCheck` and
`replayWatch`. Code, tests and every output file are in the venture's README
under "Round 5". All of it is MIT.
