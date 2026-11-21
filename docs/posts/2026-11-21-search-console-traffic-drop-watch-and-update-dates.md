---
title: "Did my Google traffic drop with an update? A Search Console watch that dates the fall and prices the odds"
seo_title: "Search Console traffic drop: date it and test it against updates"
date: 2026-11-21
tags: [changepoint-detection, seo, google-search-console, statistics]
description: "A free Search Console source for the changepoint watch, and an events file that says if a fall sits in an update window and how often chance puts it there."
---

When a site's Google clicks fall, its owner asks two questions: is this a real, lasting drop or a bad week, and did
it start with a Google update or with something we shipped? Search Console draws the line. Overlay tools paint the
update dates on top of it. Either way you are left squinting at a chart.

The [changepoint detector](../../ventures/changepoint-detector/README.md) already had a daily watch for Stripe and
Shopify numbers. Today it gets a third source and a new flag:

- **`search-console-metrics.mjs`** writes clicks, impressions, CTR and position for each finished day from your own
  Search Console property. It uses a read-only service account you create in your own Google Cloud project. It signs
  its own token with Node's built-in crypto, so it has no dependencies. Days Google still marks as incomplete are left
  out, so a half-counted day never looks like a crash. No API set-up? `--from-export Dates.csv` converts the
  Performance report's export instead.
- The **self-deploy watch repository** fetches the file each morning when you add the key as a secret. It sends one
  message when clicks or impressions move to a new level. It runs in your own GitHub account, and nothing passes
  through us.
- **`--events updates.csv`** reads your own list of dates (an update's rollout window, a release, a migration). It
  then says which detected changes have a 95% range overlapping a window. For each change it also gives the share
  of places in the series where a change that wide would have overlapped a window anyway.

That last number is the point. A few two-week rollouts a year cover a good share of the calendar. "The drop
happened during the core update" can then be a coincidence with odds of one in eight. Now the tool prints those
odds next to the claim.

## How fast does it hear a fall?

We simulated sites with 50, 400 and 3,000 clicks a day. Each had a weekly rhythm (weekends at 70%) and day-to-day
swings beyond Poisson noise (15% scatter), then a lasting fall. We ran the watch each day as a deployer's workflow
would ([`eval/gsc-watch-sim.mjs`](../../ventures/changepoint-detector/eval/gsc-watch-sim.mjs), 20 sites a cell):

| fall | heard (of 60) | median days to the alert |
|---|---|---|
| 40% | 59 | 4 |
| 20% | 13 | 4 to 9 |
| 10% | 1 | 4 |

On the 60 sites with no fall, each watched for 120 days, it sent one false alert in total, on a 50-click site. On the
180 sites with a fall it sent one more false alert, before the fall began.

So it is a good alarm for the drop that hurts, about four days after it starts. It misses most smaller drops. The
"Eager" setting heard nearly all of them but sent a false alert about once a week on the busier sites, which is
worse than no alarm. For a 10 to 20% slide, read a month of rows with the CLI. A middle setting built for this kind
of over-dispersed traffic is the next piece of work.

## What it does not do

It does not ship a list of Google update dates. The session that built this could not reach Google's status
dashboard. A list typed from memory would be a made-up record, so you paste in the dates from the dashboard
yourself. It has also only met a stand-in for Google's API. We checked that stand-in against the documented
request and answer shapes, including a real RS256 signature check, but the first real property to run it is the
real test.

The code is MIT licensed. The README section "Google Search Console as a source" has every number above.
