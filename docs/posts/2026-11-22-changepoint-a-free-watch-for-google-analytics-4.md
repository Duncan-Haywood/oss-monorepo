---
title: "A free watch for Google Analytics 4: hear a lost tag or a dead sign-up form within days"
seo_title: "A free Google Analytics 4 alert for lasting drops in traffic"
date: 2026-11-22
tags: [changepoint-detection, google-analytics, monitoring, self-hosting]
description: "The changepoint watch now reads a GA4 property through the Data API, in your own GitHub account, and reports when sessions or key events move and stay."
---

The most expensive analytics failures are quiet ones. A release drops the tracking tag from a few templates, or
a consent banner change stops some visits being counted, or the sign-up form stops sending its event. The GA4
dashboard keeps drawing a line, only lower, and nobody notices until the monthly report.

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s daily watch could already read Stripe,
Shopify and Google Search Console. Today it gained a fourth source: `ga4-metrics.mjs` reads your own Google
Analytics 4 property through the Data API and writes the daily CSV the watch reads. By default that is sessions,
active users, page views and key events, and `--metrics` names others, revenue included.

## How it runs

You set it up in your own accounts. Create a service account in your Google Cloud project, add its email as a
**Viewer** of the property, and put the key in a secret of your own GitHub repository. Then the scheduled
workflow fetches the days each morning and watches sessions, active users and key events as counts. When one of
them moves to a new level and stays there, the watch sends one message (a webhook, or a red run that GitHub
emails you). Nothing passes through us, and the code is MIT licensed with no dependencies.

A few details that matter for analytics data:

- **Days are the property's own.** The request ends at `1daysAgo`, which the Data API reads in the property's
  reporting time zone, so there is no zone to set up.
- **Late processing is re-read.** GA4 has no "this day is incomplete" flag of the kind Search Console has, so
  every run fetches the last four days again. On a busy property `--lag 2` leaves yesterday out.
- **Thresholding is named.** When Google signals withholds small counts, the answer says so and the run passes
  that on, because withheld days can look like a fall.
- **No API at all** also works: `--from-export report.csv` converts a report's CSV download, whether it has a Date
  column or GA4's "Nth day" column.

## What was checked

All of this was tested against a stand-in for Google's token endpoint and `runReport`. The stand-in checks the
JWT signature and reads `NdaysAgo` against its own date. It answers metrics in reverse order, so columns have to
be matched by name, and it caps pages at 50 rows.

On a simulated property with about 600 sessions a day, sessions fell to 55% on 16 March (a tag lost on half the
pages) and key events fell to 40% on 12 January (a form that half-broke). Reading the 243-day history once, the
watch recorded exactly one change per column: 14 March for sessions and active users, 11 January for key
events, and nothing anywhere else. That was a single read of the whole history, not a day-by-day replay. For how
many days a fall takes to be heard, the closest guide is the
[Search Console measurements](2026-11-21-changepoint-a-middle-setting-hears-20-percent-search-traffic-falls.md):
about four days for a 40% fall on counts of this size.

It has **not run against a live property**. No session here holds a key, so the first deployer's run will be that
check.

## Compared with what you have

GA4's own custom insights can email you when a metric crosses a threshold you choose, or when its model flags
one odd day. Thresholds have to be re-guessed as a site grows, and a one-day anomaly card is a different
question from "this level moved and stayed". Paid monitors such as Databox and Klipfolio keep your data on their
servers and offer the same threshold alerts. This watch asks the lasting-change question instead, for free, in
an account you own.

Set-up steps are in the README, under "Google Analytics 4 as a source", and on the
[watch page](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html).

*This is statistical analysis of data you supply, not advice.*
