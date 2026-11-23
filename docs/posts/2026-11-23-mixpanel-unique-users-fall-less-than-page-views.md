---
title: "Mixpanel in the free metric watch, and why unique users hide a lost snippet"
seo_title: "Mixpanel alerts when sign-ups or page views really drop"
date: 2026-11-23
tags: [changepoint-detection, mixpanel, github-actions, monitoring]
description: "The free metric watch now reads Mixpanel. Unique users fall far less than page views when a snippet goes missing, so it watches them with a stricter setting."
---

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html#mixpanel) runs once a day
in your own GitHub Actions. It messages Slack, Discord or Teams only when a metric's level has really moved. It
already read Stripe, Shopify, Search Console, Google Analytics 4, Plausible and PostHog. Today it reads **Mixpanel**.

## Setting it up

Make a Mixpanel service account with the read-only Consumer role on your project. Put its `username:secret` in a
repository secret, the project ID in a variable, and name the events you care about:

```
MIXPANEL_OPTIONS = --event "Sign Up" --event "Checkout Started"
```

Each morning the workflow asks Mixpanel's Query API for each event's daily count, plus the daily unique users of the
first event. That is two queries a run, well inside the API's limit of about 60 an hour. Your credentials stay in
your GitHub account and go only to Mixpanel. Nothing passes through us.

## What the simulation turned up

Mixpanel's daily-counts call gives you unique users per event. It has no "people who did any of these" count. So
with page views as the first event, the `users` column means "people who viewed a page that day".

We simulated 40 products of about 300 people a weekday, then dropped the tracking snippet from part of the site so
that each person's page views fell to 60% or 50%. The daily watch caught the fall in page views almost every time.
It caught the fall in unique users **0 times in 40**.

The arithmetic explains it. Someone who views three pages a day is still counted as a viewer when one of those pages
loses the snippet. If page views per person follow a Poisson distribution with a mean of 2.5, about 92% of visitors
view at least one page. Halve the views and that becomes 71%. So unique users fall about 22% while page views fall
50%. The watch's default for counts is tuned to send almost no false alerts beside a deep weekly cycle, and it lets
a 15-22% fall slide.

## Picking the fix by a rule set in advance

Before running a second round on fresh simulated products, we wrote down when a different setting would replace the
default. It had to hear the users fall at least 36 times in 40. It could not hear page views or sign-ups less often
than the default. And it could send at most two more false alerts across 40 healthy products.

- **Removing the weekly cycle** (`--period 7`) heard everything, but sent 16-19 false alerts on 40 healthy products.
  It failed.
- **The middle setting** (`--detector pelt --overdispersion nb --trend gated`) heard the users fall 38-40 times in
  40 and every sign-up drop. It sent 1 false alert across 80 healthy products, against the default's 5. It passed.

So when Mixpanel is the source, the workflow watches with the middle setting. Its growth term, measured in an
[earlier round](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md),
lets a product that is growing steadily grow without alerts.

## What is not checked yet

No live Mixpanel project has been used. The code was tested against a stand-in built from Mixpanel's documented
request and answer. The hosts and sign-in scheme match Mixpanel's own Python client. A real project is the next
check. If you run one and the watch helps, or gets something wrong, an
[issue](https://github.com/Duncan-Haywood/oss-monorepo/issues) is the best way to tell us.

*Statistical analysis of data you supply, not advice.*
