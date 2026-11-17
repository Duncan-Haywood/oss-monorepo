---
title: "One alert a month, as a setting: picking how eager a metric watch should be from its own history"
seo_title: "Metric alert budget in plain terms: alerts a month, from your history"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, alerting, github-actions, cli]
description: "The Changepoint Detector's daily watch can pick its own sensitivity from your history, within a budget like one alert a month. Measured on TCPD."
---

Anyone who has set up an alert on a business metric knows how it usually goes. Make it too eager
and it pings on noise until people mute the channel. Make it too quiet and it says nothing when the
level really moves. The [Changepoint Detector](../../ventures/changepoint-detector/) has a watch
that runs once a day on GitHub's free runners, in your own repository, and alerts once per
confirmed change. It offers three "How eager" settings, and until today you had to pick one
yourself.

Earlier today the web page gained a hint. It replays your own history once per setting, counts how
many alerts each one would have sent, and suggests the most eager one that stayed within a budget.
That budget was decided before the test was run: 2 alerts per 100 checks. On the Turing Change Point
Dataset (TCPD) the hint reached 17 of 31 later marked changes, against 16 for the quiet default. That
is a narrow win, and the
[README's "Round 6"](../../ventures/changepoint-detector/README.md) says so.

Two things were missing, and this run added both.

**The hint now works in the scheduled watch.** `node watch.mjs daily.csv --suggest` prints the
replay table and the suggested setting. `--detector auto` goes further: the first scheduled run
picks the setting from the history, writes the pick into the state file, and every later run
reuses it. So the watch does not quietly switch settings as the series grows. With under 30 points
of history it keeps the quiet default and says why.

**You give the budget in plain terms.** Nobody thinks in "alerts per 100 checks", but "about one
a month" is easy to answer. `--alerts-per 1/month` (or `2/week`, `6/year`) with `--check-every day`
does the conversion. A month is a twelfth of 365.25 days, so one alert a month at a daily check is
3.29 per 100 checks. Read back the other way, the default budget of 2 per 100 is about 7 alerts a
year.

## What those budgets did on real series

For this test each TCPD series was cut in half. The first half was the history used to pick a
setting, and the pick was scored only on the second half. Every number from the original round
came out the same on the re-run.

| budget | alerts per 1,000 checks | marked changes reached |
|---|---|---|
| quiet default | 16.0 | 16 of 31 |
| about 7 a year (shipped default) | 17.5 | 17 of 31 |
| 1 a month | 19.6 | 19 of 31 |
| 1 a week | 75.3 | 29 of 31 |

"One a month" reached three more real changes than the default, and 45% of its alerts were at a
change the annotators had marked, the best share of any row. On the six held-out series it reached
the same 6 of 9 changes as the default, with about a third more alerts. "One a week" behaves
almost like the eager setting. These rows decided nothing, and the shipped default stays at the
pre-registered 2 per 100. What they give you is a menu with measured costs.

One more pattern: on every budget up to one a month, the future alert rate came out well under
the budget. The budget limits what a setting sent on the history, and most series were quieter in
their second half.

To try it on your own metric, run `sh deploy/make-watch-repo.sh my-watch`, then set the repository
variable `WATCH_OPTIONS` to `--detector auto --alerts-per 1/month`. Everything is MIT licensed,
has no dependencies, and runs in your own account.

*Statistical analysis of data you supply, not advice.*
