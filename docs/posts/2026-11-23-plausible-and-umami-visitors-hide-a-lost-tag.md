---
title: "Plausible and Umami visitors hide a lost tag: an earlier test of ours was wrong"
seo_title: "Why visitors barely drop when your analytics tag breaks"
date: 2026-11-23
tags: [changepoint-detection, plausible, umami, monitoring]
description: "When a tag drops off half a site's pages, visitors fall only about a quarter. Our earlier test missed it; the watches now use a stricter setting."
---

The [Changepoint Detector](https://marisstella.app/changepoint-detector/)'s free
[metric watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html#plausible) runs once a
day in your own GitHub Actions and messages you when a metric's level has really moved. For Plausible and Umami it
watches visitors, page views and your goals or events.

Earlier we reported that when a site's tracking tag dropped off 40% of its pages, the watch heard the fall in
visitors on all 40 simulated sites. That result came from how we built the simulation, not from how the watch would
behave on a real site.

## Why visitors barely move

The simulation cut visitors by the same share as page views. Real visitor counts don't fall that way. Plausible
counts a person and Umami counts a session as long as **one** of their page views is still tracked. Someone who reads
three pages after the tag vanished from half of them has a seven-in-eight chance of hitting a page that still tracks.

So we rebuilt the simulation one person and one session at a time. A typical site had 400 people a weekday, each
making 1.2 sessions of about 2.2 pages. When page views fell to half, Umami's visitors only fell to 73% and
Plausible's to 77%. A drop that small sits inside an ordinary week's swing, so the watch's plain setting for counts
heard it on 0 to 2 of 40 sites.

## What we changed, and the rule we set first

Matomo and Mixpanel had already shown this pattern
([Matomo's visits](2026-11-23-matomo-visits-hide-lost-tracking.md)). So before running anything we committed a rule.
The stricter "middle" setting (`--detector pelt --overdispersion nb --trend gated`) would become the default only if
it heard visitors on at least 36 of 40 sites, heard page views and sign-ups as often as the plain setting (minus 2),
and added at most two false alerts across 40 healthy sites.

| source, setting | visitors heard | false alerts, 40 healthy sites |
|---|---|---|
| Umami, plain count | 0 to 2 of 40 | 4 and 3 |
| Umami, middle | 40 of 40 | 4 and 2 |
| Plausible, plain count | 0 of 40 | 4 and 3 |
| Plausible, middle | 39 to 40 of 40 | 4 and 2 |

It passed every line for both sources. New watch repositories now use the middle setting for Plausible and Umami. If
you set up one of these watches before today, set the variable `WATCH_OPTIONS` to
`--detector pelt --overdispersion nb --trend gated` to get the same behaviour. If you set it already, nothing changes.

## What this does not cover

Our model drops page views at random. A real breakage usually hits one template, so the pages built on it go dark
for everyone. Then people who only see those pages disappear entirely, and visitors fall *further* than in our test.
Random loss is the hard case. No live Plausible or Umami site has been used yet. PostHog's "users" column is the same
kind of count, and we haven't tested it this way yet. That comes next.

The full numbers and the pre-registered rule are in the project
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) ("Visitors under a
partial snippet loss").

*Statistical analysis of data you supply, not advice.*
