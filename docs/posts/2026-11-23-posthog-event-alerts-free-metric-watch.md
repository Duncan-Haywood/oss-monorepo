---
title: "Hear when a release stops sending sign-ups: PostHog events in a free self-hosted metric watch"
seo_title: "PostHog alerts when an event or sign-ups really drop"
date: 2026-11-23
tags: [changepoint-detection, posthog, github-actions, monitoring]
description: "The free metric watch now reads PostHog: a daily count per event plus the people doing them, so a dropped capture call reaches you in days."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html#posthog) runs once a day
in your own GitHub Actions and messages Slack, Discord or Teams only when a metric's level has really moved. It
already read Stripe, Shopify, Search Console, Google Analytics 4 and Plausible. Today it reads **PostHog**, the product
analytics a lot of young software companies start on.

## The failure it is for

A release ships. One sign-up path no longer calls `posthog.capture('signed_up')`, or a new layout leaves the snippet
off half the pages. Nothing errors. The dashboards look a bit low, the kind of low you might put down to a quiet week.
A daily watch on the event counts dates the drop within days, with a message, so nobody has to open the funnel report
to notice.

## How to set it up

1. Make the watch repository from the watch page (no terminal needed).
2. In PostHog, Settings > Personal API keys: create a key with the *Query: Read* scope. Add it as the repository secret
   `POSTHOG_API_KEY`, and the project ID as the variable `POSTHOG_PROJECT`.
3. Name your events in the variable `POSTHOG_OPTIONS`, for example
   `--event '$pageview' --event signed_up --event "Checkout Started"`. On EU Cloud, set `POSTHOG_HOST` to `eu`.

Each morning the workflow asks PostHog's query API for each event's daily count in the project's time zone, plus the
number of people who did any of them, and watches every column. The key stays in your GitHub account and goes only
to PostHog. Nothing passes through us, and the code is MIT.

## How well it hears, measured

These come from simulated products, not real ones: 40 per setting, about 300 people a weekday, 2.5 page views each,
3% signing up, over 242 days (`eval/posthog-columns.mjs` in the repository).

| Fault | Heard within 7 days |
|---|---|
| Sign-ups fall to 35% | 39 of 40 |
| Page views fall to 50% | 40 of 40 |
| Page views fall to 60%, weekends at half a weekday | 40 of 40 |
| Page views fall to 60%, weekends at 40% of a weekday | 36 of 40 |

On 40 products with no fault, page views and people raised no false alert, and sign-ups raised one or two. One
finding: the deeper a product's weekly cycle, the larger a drop has to be before the default hears it. A 40% fall on
a product that is nearly shut at weekends is heard about nine times in ten, not every time.

## What is not checked yet

No PostHog account was used. The requests follow PostHog's published query API documentation and were tested against
a stand-in server, including an event name built to break out of the query string (it stays inside it). A live
project is the next check: whether day boundaries follow the project's time zone on every PostHog version, and how
self-hosted instances page large answers.

Statistical analysis of data you supply, not advice.
