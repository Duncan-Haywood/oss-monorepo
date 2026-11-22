---
title: "Hear when sign-ups stop: Plausible Analytics goals as a free self-hosted metric watch"
seo_title: "Plausible Analytics alerts when sign-ups or traffic really drop"
date: 2026-11-22
tags: [changepoint-detection, plausible-analytics, github-actions, monitoring]
description: "The free metric watch now reads Plausible: visitors, page views and a column per goal, so a broken sign-up form reaches you in about a week."
---

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) runs once a day in your own
GitHub Actions and posts to Slack, Discord or Teams only when a metric's level has really moved. It could already read
Stripe, Shopify, Search Console and Google Analytics 4. Today it reads **Plausible Analytics**, the cookie-free analytics
a lot of small sites and indie products use instead of Google's.

## Why goals matter more than traffic

The failure that costs a small product the most is rarely a traffic crash: you notice those. It is the quiet one. A
release changes the sign-up form and it stops sending its goal; a new page template forgets the script on half the
pages. Traffic charts look roughly fine, and nobody opens the goal report for a fortnight.

So each `--goal` you name becomes its own column of daily conversions, watched beside visitors and page views:

```
PLAUSIBLE_API_KEY=... node plausible-metrics.mjs --site example.com --goal Signup --out data/plausible.csv
```

In the self-deploy workflow it is a secret (`PLAUSIBLE_API_KEY`, a Stats API key from Account settings) and two
variables (`PLAUSIBLE_SITE`, and `PLAUSIBLE_OPTIONS` set to `--goal Signup`). A self-hosted Plausible takes
`PLAUSIBLE_URL`. No Google Cloud project, no service account.

## How well it hears, in simulation

On 40 simulated sites of about 400 visitors a weekday, with a tag lost from 40% of pages and a sign-up form losing 65%
of its conversions (about 8 a day to 3):

| column | faults heard (within 7 days) | sites with no fault that got a false date |
|---|---|---|
| visitors | 40 of 40 | 0 of 40 |
| page views | 40 of 40 | 0 of 40 |
| sign-up goal | 38 of 40 | 2 of 40 |

The goal column is the noisier one: a handful of conversions a day leaves less room between a bad week and a broken
form. Visits added nothing visitors did not already hear, so they are fetched but not watched by default. These are
simulated sites; the script is in `eval/plausible-columns.mjs` if you want to change the sizes.

## One design choice: an empty day is a real zero

The Google Analytics source waits on empty days at the end of a fetch, because Google may still be processing them.
Plausible counts live, so an empty day is written as zero right away. That is the point: a tag that fell off every page
looks exactly like a run of zeros, and the watch should see it the next morning.

## What was not checked

No Plausible account was used. The requests follow Plausible's published Stats API v2 and were tested against a
stand-in that behaves as documented (it leaves out empty days and pages its answers), including the full GitHub Actions
workflow. If you run it on a real site, the README section "Plausible Analytics as a source" says what to look for.

Statistical analysis of data you supply, not advice. MIT licensed.
