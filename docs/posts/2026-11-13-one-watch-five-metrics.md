---
title: "One watch, five metrics: why we did not split the alert budget"
seo_title: "Watching several KPIs for changes: a split alert budget did not help"
date: 2026-11-13
tags: [changepoint-detection, monitoring, alerting, kpi, pre-registration, negative-result]
description: "The changepoint watch now monitors every column of a KPI sheet. A pre-registered split of the alert budget across columns failed on noise and real data."
---

The [changepoint detector's watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) runs daily in your own GitHub account and messages Slack, Discord, Teams or Mattermost when a metric changes level for good, not on one odd day. Until today it watched one column. A business that tracks orders, revenue and sign-ups needed three repositories.

Now one is enough:

```
node watch.mjs kpi.csv --state watch-state.json --columns all
node watch.mjs kpi.csv --state watch-state.json --columns orders:poisson,revenue,signups:poisson
```

Each column runs the same watch as before, with its own record in one state file. A day's new changes arrive as one message that names the columns that moved. A model can be set per column, so counts and money can share a sheet. The standalone repository made by `deploy/make-watch-repo.sh` runs it; put the option in the `WATCH_OPTIONS` variable.

## The budget question

Five metrics give noise five chances a day to look like a change. The watch already has an alert budget: `--detector auto --alerts-per 1/month` replays your history and picks the most eager setting that would have stayed within about one alert a month. The obvious move for five columns is to give each a fifth of the budget, so the whole watch stays near one a month.

Before running anything we wrote the rule down ([`eval/watch-columns.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/watch-columns.mjs)). The split would ship only if, on five columns of pure noise, it kept the whole watch at or under the budget **and** the unsplit version went over it.

| set | columns | each column gets the whole budget | budget split across columns |
|---|---|---|---|
| pure noise, 10 seeds | 5 | 1.33 alerts per 100 checks | 0.13 |
| UK road casualties, monthly | 5 | 5 alerts | 8 alerts |
| bike share, daily counts | 2 | 89 | 89 |
| German unemployment, quarterly | 2 | 5 | 5 |
| orange juice price and producer prices | 2 | 20 | 20 |

## It failed, for two reasons

First, there was nothing to fix. Without any split, five noise columns sent 1.33 alerts per 100 checks for the whole watch, under the budget of 2. The default setting is already quiet on noise.

Second, on the one real set where the split changed anything, it made things worse. On the UK driver-casualty columns, the smaller budget moved two columns from the Middle setting to Quiet, and on those seasonal monthly series Quiet sent *more* alerts than Middle (4 against 2 for one column). The settings are named by how eager they are on typical data, but on a given series their alert counts are not always in that order. A rule that assumes they are can backfire. The 1983 seat-belt law, a documented change, was alerted in two columns either way.

So the split did not ship. Each column is picked against the whole budget, as a single metric is. The honest open item is a budget rule that does not assume the settings are ordered.

## What else the numbers say

The bike-share columns sent about 15 alerts per 100 checks on every setting, even with the weekly cycle removed. A level that moves with weather and season keeps tripping a level watch. That is why the tool lets you replay your own history (`--suggest`, or the replay card on the page) before you set a watch up: it tells you, on your own data, how often you would have been pinged.

All numbers: the [README section](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md) "Several metrics in one watch" and `eval/watch-columns.out.txt`. Statistical analysis of data you supply, not advice.
