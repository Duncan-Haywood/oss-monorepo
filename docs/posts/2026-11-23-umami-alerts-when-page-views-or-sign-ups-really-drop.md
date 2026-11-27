---
title: "Hear when your Umami site loses its tracker or its sign-ups: a free metric watch now reads Umami"
seo_title: "Umami alerts when page views or sign-ups really drop"
date: 2026-11-23
tags: [changepoint-detection, umami, github-actions, monitoring]
description: "The free metric watch now reads Umami, cloud or self-hosted: page views, visitors and custom events per day, and an alert only when a level really moves."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html#umami) runs once a day in
your own GitHub Actions and messages Slack, Discord or Teams only when a metric's level has really moved. It already
read Stripe, Shopify, Search Console, Google Analytics 4, Plausible and PostHog. Today it reads **Umami**, the
open-source analytics many developers run on their own server or on Umami Cloud.

## What you set

An API key as the secret `UMAMI_API_KEY`, the website ID as the variable `UMAMI_WEBSITE`, and, to watch a sign-up,
`UMAMI_OPTIONS` set to `--event signup`. For a self-hosted Umami, its address as `UMAMI_URL`. Each morning the watch
fetches page views, visitors and each named event per day and checks them. Each run also prints every custom event
name Umami saw, with its total, so you can copy the exact spelling (names are case-sensitive).

## Two things in Umami's code that mattered

The documentation site was not reachable from where this was built, so the request and answer shapes were read from
Umami's own source. Two details there would have broken a naive fetcher:

- **Umami answers by the day only for up to seven calendar months.** Ask for 480 days by the day and it quietly
  answers by the month (`getAllowedUnits` in its date helpers). The fetcher asks in 180-day windows, and refuses any
  row that is not a day instead of misreading a month as one.
- **Days come in two formats**: `2026-11-20` from PostgreSQL installs and `2026-11-20T00:00:00Z` from ClickHouse ones.
  Both are read.

## Does it matter whose midnight you count from?

Plausible and PostHog count days in the site's own time zone. Umami counts them in whatever zone the call names, so
the fetcher defaults to UTC and takes `--timezone`. We measured whether that default costs anything: 40 simulated sites
per cell, generated hour by hour in the audience's own time (about 400 visitors a weekday, a mid-afternoon peak), cut
into the audience's own days and into UTC days with the same random draws.

| Audience | Days counted in | Tracker lost from 40% of pages, heard in visitors | Sign-ups down 65%, heard |
|---|---|---|---|
| New York | its own | 40 of 40 | 35 of 40 |
| New York | UTC | 40 of 40 | 38 of 40 |
| Tokyo | its own | 40 of 40 | 35 of 40 |
| Tokyo | UTC | 40 of 40 | 36 of 40 |

Page views and visitors sent no false alert on 40 healthy sites in any cell; the sign-up column sent 6 or 7 on 3 to 5
sites either way. The gaps are within what a different random draw moves. A day cut at the wrong hour still holds the
same people, so a lasting fall is heard either way. What a wrong zone changes is the date in the alert, which can be a
day off. `--timezone` fixes that.

## What has not been checked

No live Umami account or server was used: the tests run against a stand-in built from Umami's source code. The cloud
address and header follow Umami's published API documentation, so the first real Umami Cloud fetch is the check that
counts. Full details and every number: the project README, "Umami as a source". Statistical analysis of data you
supply, not advice.
