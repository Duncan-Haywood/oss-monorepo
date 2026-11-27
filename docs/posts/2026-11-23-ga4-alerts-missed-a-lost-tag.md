---
title: "Our GA4 watch missed a lost tag on 39 of 40 sites, and what fixed it"
seo_title: "Why GA4 active users barely drop when your tag breaks"
date: 2026-11-23
tags: [changepoint-detection, google-analytics, posthog, monitoring]
description: "With the GA4 tag gone from half a site's pages, active users fell only to 76%. Our old watch heard it on 1 site in 40; the new default hears 37 to 40."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s free
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) runs once a day in your
own GitHub Actions and messages you when a metric's level has really moved. Earlier today we found that
[Plausible and Umami visitors hide a lost tag](2026-11-23-plausible-and-umami-visitors-hide-a-lost-tag.md). Two
sources were left untested: Google Analytics 4 and PostHog. They turned out to be the worst case.

## Why GA4 was nearly deaf to the failure it was set up for

Our GA4 watch looked at three columns: sessions, active users and key events. It skipped page views. That meant a tag
lost from part of the site could only show up in sessions and active users. Those are the two columns that fall the
least, because anyone who sees one still-tagged page is still counted.

We simulated sites one person, session and page view at a time: 400 people a weekday, about 1.2 sessions each and
2.2 pages a session. When the tag dropped off half the page views:

| column | level after the loss |
|---|---|
| page views | 50% |
| sessions | 73% |
| GA4 active users | 76% |
| PostHog users | 76% |

A quarter off sounds like a lot. But it sits inside an ordinary week's swing between weekdays and weekends, and the
plain count setting heard it on **1 of 40** GA4 sites (through sessions) and **0 of 40** PostHog products.

## The rule, written before the run

We committed the test's rule before running it, on seeds no earlier run had used. The stricter "middle" setting
(`--detector pelt --overdispersion nb --trend gated`) would become the default for a source only if:

- it heard the fall in people on at least 36 of 40 sites (for GA4, in sessions too),
- it heard every other column as often as the plain setting, give or take 2, and
- it added at most 2 false alerts across 40 healthy sites.

For GA4 we added one more test: watch page views too, if they hear the loss on at least 36 of 40 sites and add at
most 2 false alerts.

| source, setting | people heard | false alerts, 80 healthy sites |
|---|---|---|
| PostHog, plain count | 0 of 40 | 0 |
| PostHog, middle | 37 to 40 of 40 | 2 |
| GA4, plain count | 0 of 40 (sessions 0 to 1) | 0 |
| GA4, middle | 37 to 40 of 40 | 2 |
| GA4 page views, middle | 40 of 40 | 0 |

Every line passed. A form that stopped sending 65% of its sign-ups was heard on 40 of 40 sites with the middle
setting, against 35 to 39 with the plain one. All four false alerts came from the sign-up or key-event column.

## What changed

New watch repositories now watch GA4's sessions, active users, page views and key events with the middle setting, and
PostHog's events and users the same way. Every analytics source the watch reads (GA4, Plausible, PostHog, Umami,
Mixpanel and Matomo) now uses the middle setting by default. If you set up a GA4 or PostHog watch before today, set
the repository variable `WATCH_OPTIONS` to `--detector pelt --overdispersion nb --trend gated`. For GA4 add
`--columns sessions:poisson,activeUsers:poisson,screenPageViews:poisson,keyEvents:poisson` in front of it.

## What this does not cover

The model drops page views at random. A real breakage usually takes out one page template for everyone, and that
makes people columns fall *further* than here. In GA4 the tag that sends page views often sends key events too, so a
lost tag on a page with a form would move key events as well. We did not simulate growth, and no live GA4 property
or PostHog project has been used yet.

The numbers, the rule and the script are in the project
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) ("PostHog users and
GA4 activeUsers under a snippet loss").

*Statistical analysis of data you supply, not advice.*
