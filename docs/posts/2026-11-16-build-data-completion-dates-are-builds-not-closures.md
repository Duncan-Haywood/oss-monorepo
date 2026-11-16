---
title: "Permit completion dates are real builds, but Seattle's dateless \"Completed\" permits mostly never finished"
seo_title: "Are permit completion dates real builds? SF, Seattle, Austin audit"
date: 2026-11-16
description: "An audit of 1.3 million permits: 0.04 to 1.5% of completion dates sit on dead permits; 71% of Seattle's dateless Completed ones closed incomplete."
tags: [research, build-data, construction, open-data, data-quality]
---

# Building-permit completion dates are real builds, but Seattle's dateless "Completed" permits mostly never finished

The build-data programme forecasts how long a building takes from permit issue to completion, using open permit feeds from San Francisco, Seattle and Austin. Every model in it learns from one label: the feed's completion date minus its issue date. This session checked whether that label means what we assume it means.

It also corrects something we got wrong. The [last post](2026-11-15-build-data-what-never-closed-permits-are.md) said Seattle holds "about 10,000 finished builds whose completion date is simply missing", because their status reads "Completed" but they have no date. While listing the feed's columns this session, we pulled three of those permits. All three descriptions begin "Closed as Incomplete - Expired Permit".

## What we checked

We pulled every permit issued from 2010 to 2022: 420,714 in San Francisco, 88,626 in Seattle and 836,092 in Austin. For each one we kept only its status, issue date, completion date and permit type. For Seattle we also kept a yes/no flag, computed by the city's API, for whether the description contains "closed as incomplete". No description text was stored. Statuses were grouped as done (complete, completed, final), dead (expired, void, withdrawn, cancelled, revoked, or Seattle's closed-as-incomplete flag) or other. We wrote five predictions down and committed them before the pull.

## Completion dates are builds

| city | dated completions | on a dead permit | median days, done | median days, dead |
|---|---|---|---|---|
| San Francisco | 264,633 | 117 (0.04%) | 123 | 169 |
| Seattle | 70,666 | 282 (0.40%) | 247 | 406.5 |
| Austin | 752,559 | 11,211 (1.49%) | 102 | 140 |

At most 1.5% of the completion dates belong to permits the status calls dead. Most of Austin's are "withdrawn" permits that still carry a completion date. Those dates sit in the tail: the dead permits' 90th percentile is 1,080 days, against 379 for finished ones. We had predicted their median would be more than double. It is 1.37 times. Whether 1.5% of tail rows moves a 0.9-quantile model is the next test.

## Seattle's dateless "Completed" permits

Of the 5,450 Seattle permits issued 2010 to 2022 that read "Completed" with no completion date, 3,876 (71%) say "Closed as Incomplete" in their description. Only 36 of the 70,666 dated completions do. We had predicted at least 80%, so that prediction is refuted. The direction still holds: most of these permits were closed out at expiry, not built.

The other 1,574 do read like real work: new houses, additions, an antenna. The only other date the feed gives them is the permit's expiry, which says nothing about when a build finished. At best they are builds that finished at some unknown time before today. They can't become labelled training rows.

## What the never-completed permits are, per city

- **Austin:** 99% of permits without a completion date are dead on the pull day.
- **Seattle:** 83% are dead, counting the closed-as-incomplete flag.
- **San Francisco:** 10% are dead, and 90% still read "issued".

So Seattle and Austin can teach a model what share of permits never close, and San Francisco can't. Within a city that share varies by permit type less than we expected. In Austin it runs from 6.1% (driveways and sidewalks) to 16.5% (building permits). In Seattle's named types it runs from 7.9% (demolition) to 17.6% (additions and alterations). That is about 10 points, not the 20 we predicted. A per-city "never closes" rate probably matters more than a per-type one.

## Caveats

These are statuses as of 16 November 2026, not as of any forecast date. We matched one closure phrase. No model was refit this session.

Code: [`research/build-data/src/label_audit.py`](../../research/build-data/src/label_audit.py). Counts: [`results/label_audit.json`](../../research/build-data/results/label_audit.json). The full log, with all five predictions and their outcomes: [`LOG.md`](../../research/build-data/LOG.md), session 94.

*AI-assisted research; not engineering, legal or financial advice. No affiliation with any city is implied.*
