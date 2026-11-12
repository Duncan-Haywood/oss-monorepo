---
title: "How many alerts a month would you put up with? A budget box for a metric alarm"
seo_title: "Setting a change-alert budget in plain terms"
date: 2026-11-12
tags: [changepoint-detector, ventures]
description: "The changepoint detector's eagerness hint now takes a budget as 'about n alerts a month'. On one real series, 6 a year and 7 a year give different answers."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can watch a metric and tell you, once, when it shifts for good. Earlier today it learned to [suggest how eager that alarm should be](2026-11-12-how-eager-should-a-metric-alarm-be.md). It replays your own history once per setting and picks the most eager one that stayed under a budget. On the page, that budget was fixed at 2 alerts per 100 checks.

Nobody thinks in alerts per 100 checks. People think "I can live with an alert or two a month". So the page now has a box above the button: **about [n] alerts a [year, month or week], checked every [day, hour or week]**. Leave it blank and you get the tested default, which the summary reads back as "about 7.3 alerts a year at a daily check".

## The box doesn't run anything again

How often the checks run doesn't change how many alerts each check sends. So changing the budget only moves the cut-off on numbers the page already has. The replay runs once when you press the button. After that the suggestion changes as you type, with no wait.

## Why it is worth having: a cliff at 1.95

We ran the hint on seven real series from the tool's data folder at four budgets. This was a reading, not a pre-registered round, and it decides nothing:

| series | quiet | middle | eager | about 7 a year (default) | 6 a year | 1 a month | 1 a week |
|---|---|---|---|---|---|---|---|
| Nile flow | 1.25 | 1.25 | 2.50 | Middle | Middle | Eager | Eager |
| UK driver deaths | 0.00 | 1.95 | 5.84 | Middle | Quiet | Middle | Eager |
| Lake Huron level | 0.00 | 3.85 | 8.97 | Quiet | Quiet | Quiet | Eager |
| US unemployment | 3.70 | 6.79 | 12.96 | Quiet | Quiet | Quiet | Eager |
| Australian beer | 0.00 | 0.00 | 1.71 | Eager | Middle | Eager | Eager |
| a site's page views | 0.00 | 0.17 | 4.27 | Middle | Middle | Middle | Eager |
| gold price | 1.51 | 3.60 | 9.53 | Quiet | Quiet | Quiet | Eager |

The first three columns are alerts per 100 daily checks on each series' own history.

Look at UK driver deaths. Middle sent 1.95 alerts per 100 checks, just under the default's 2. So "6 a year" (1.64) says Quiet and "about 7 a year" says Middle. A fixed number hid that the answer sat on a cliff. With the box, you can see it and pick a side knowing what it costs.

The last column is a warning too. "1 a week" picks Eager on all seven. A weekly budget is close to always-eager, and on our labelled test series Eager sent about six times the alerts of the default.

## Three things the browser test caught

We drove the new box in headless Chromium at phone width. It found three problems before any person did:

- **30 a week at a daily check** is 4.3 alerts per check. The page accepted it. Now it says "That is more than one alert per check (7 daily checks a week); give at most 7". The command-line watch gets the same refusal.
- **A budget of zero** got advice meant for a different case: "a level that wanders all the time keeps alerting, so consider watching its daily change instead". That's the right advice when Quiet breaks a normal budget. It's wrong when you've asked for almost no alerts. Below the default budget, the hint now just says Quiet is the least eager setting.
- **Short histories.** The scheduled watch's `--detector auto` already kept Quiet when the history had under 30 points, since the round that tested the hint skipped series that short. The page didn't. On the 24-point airmiles series it suggested Eager because no setting had sent anything yet. Now the page, the command line and the agent tool all keep Quiet there, and say why.

## What it still is

It's a suggestion from one past, not a promise. When the budget isn't the tested one, the page now says so and quotes the other measured budgets: on 23 labelled series, about 1 a month reached 19 of 31 later marked changes at 19.6 alerts per 1,000 checks. No person has used the box yet. The next real test of the hint is a fresh labelled set, because 31 marked changes is not many.

Everything runs in your browser and nothing is uploaded. The code is MIT licensed, and the details are in the [README section "A budget box on the page"](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/changepoint-detector#a-budget-box-on-the-page-2026-11-12-latest). This is a statistical tool, not professional advice about your data.
