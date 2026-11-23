---
title: "Matomo in the free metric watch: visits hide lost tracking, page views don't"
seo_title: "Matomo alerts when visits, goals or events really drop"
date: 2026-11-23
tags: [changepoint-detection, matomo, github-actions, monitoring]
description: "The free metric watch now reads Matomo. Visits fall far less than page views when tracking drops off pages, so it watches them more closely."
---

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html#matomo) runs once a day
in your own GitHub Actions. It messages Slack, Discord or Teams only when a metric's level has really moved, not on
one odd day. It already read Stripe, Shopify, Search Console, Google Analytics 4, Plausible, PostHog, Umami and
Mixpanel. Today it reads **Matomo**, self-hosted or on Matomo Cloud.

Matomo is the analytics people run themselves when the data has to stay in their own hands, which is why public
bodies and many European businesses use it. Those are also the sites where nobody gets a warning when a theme update
quietly removes the tracking code from half the pages.

## Setting it up

In Matomo, create an auth token (Administration > Personal > Security > Auth tokens). Put it in a repository secret
called `MATOMO_TOKEN`. Put your Matomo's https address in `MATOMO_URL` and the site ID in `MATOMO_SITE`. To also hear
when a goal stops converting or a button stops sending its event:

```
MATOMO_OPTIONS = --goal 2 --event "Sign up"
```

Each morning the workflow fetches visits, page views, each goal's conversions and each event action per day, in the
site's own time zone. The token goes in a POST body rather than the URL. That way Matomo 5's default "secure requests
only" tokens work, and the token never shows up in your web server's access log. It goes only to your Matomo, from
your GitHub account.

## Visits barely move when tracking drops off pages

A visit counts in Matomo if it touches any tracked page. Suppose a visitor views about 2.5 pages on average, and the
tracking code disappears from half of them. Page views halve. But a visitor who saw three pages is very likely to
have hit at least one page that still tracks, so visits fall only from about 92% to 71% of their old level, about 22%.

We saw the same effect in [Mixpanel's unique users](2026-11-23-mixpanel-unique-users-fall-less-than-page-views.md)
earlier today. So before running anything, we wrote down a rule for when Matomo should get the stricter "middle"
setting instead of the watch's default for counts. It had to hear the fall in visits on at least 36 of 40 simulated
sites. It could not hear page views or goals less often than the default. And it could add at most two false alerts
across 40 healthy sites.

| setting | visits fall heard | page views, goal heard (worst case) | false alerts on 40 healthy sites |
|---|---|---|---|
| count default | 0 to 2 of 40 | 35, 36 | 5 and 1 |
| middle (`--detector pelt --overdispersion nb --trend gated`) | 35 to 40 of 40 | 40, 39 | 2 and 3 |

The middle setting passed every line, so the Matomo workflow uses it. Visits stay unreliable on their own in one
case: page views falling to 60% with very quiet weekends, where the middle setting heard visits on 35 of 40. Page
views heard that same fault on 40 of 40, and the watch follows both columns.

The same reasoning probably applies to Umami's `visitors` column, which also counts sessions. Its simulation never
tested this, so it is the next item on the list.

## What is not checked yet

No live Matomo server has been used. The code was tested against a stand-in for Matomo's Reporting API, built from
its documented methods and answers, including its habit of reporting errors as HTTP 200. A real server is the next
check. If you run one and the watch helps, or gets something wrong, an
[issue](https://github.com/Duncan-Haywood/oss-monorepo/issues) is the best way to tell us.

*Statistical analysis of data you supply, not advice.*
