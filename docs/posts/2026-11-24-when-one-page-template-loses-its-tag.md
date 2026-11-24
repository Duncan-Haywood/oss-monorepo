---
title: "When one page template loses its analytics tag, the totals barely move"
seo_title: "Detecting a GA4 tag lost from one page template"
date: 2026-11-24
tags: [ventures, changepoint-detector, analytics, ga4]
description: "A help centre losing its GA4 tag moved active users 4%. The watch heard it on 0-6 of 40 simulated sites; a dark-section check heard all 40, with no false calls."
---

A tracking tag usually breaks one template at a time. A theme update drops it from the blog
layout, a help centre moves to a hosted tool, or checkout ends up on a payment provider's domain.
Every page of that type goes dark for everyone, and the rest of the site carries on as normal.

The [metric watch](../../ventures/changepoint-detector/watch-a-metric-for-changes.html) runs
each morning in your own GitHub repository and watches GA4's sessions, active users, page views
and key events. Its earlier tests dropped page views at random. Today's round simulated the real
shape instead. Each simulated site has six templates (home, category, product, blog, help and
checkout). On some sites one template goes dark from a set date, and healthy sites have the odd
blog post that takes off.

## How far the totals fall

Over the four weeks either side of the loss:

| template gone dark | its share of page views | page views fall to | active users fall to |
|---|---|---|---|
| help | about 8% | 0.916 | 0.963 |
| blog (the most-landed) | about 21% | 0.786 | 0.907 |
| checkout | about 7% | 0.932 | 0.994 (key events to 0) |

A 4% dip in active users looks like an ordinary slow week. The watch heard the help-centre loss on
0 to 6 of 40 sites, depending on the round and on how deep weekends dip. It heard the blog loss on
36 to 39 of 40, and the checkout loss on all 40, through key events.

## The obvious fix failed first

The obvious fix is to fetch page views per section of the site and watch those too. We set the
rule in advance and it failed. Section columns are noisy in the way that matters: every blog post
that took off was reported as a change, and false dates on 40 healthy sites rose from 158 to 322
(62 to 182 where weekends dip deeper). The help column was also missing from the test entirely, because the round had picked the
five busiest sections after the loss, when help had stopped counting.

## What worked: a narrow question

So the second round, set in advance on fresh simulated sites, asked a narrower question: has a
section gone dark? A section counts as dark when its last three days average under a tenth of its
mean over the 28 days before, from at least 20 views a day. A post going viral can never trip that.

| weekends | help dark: watch alone | watch plus dark check | false calls on 40 healthy sites |
|---|---|---|---|
| half of weekdays | 1 / 40 | 40 / 40 | 0 |
| 40% of weekdays | 3 / 40 | 40 / 40 | 0 |

Every call started on the day of the loss and went out on its third day. The blog loss was heard
on 40 of 40 at both weekend depths.

## What ships

- `ga4-metrics.mjs --sections 5` writes a `views_<section>` column for each of the five busiest
  first path segments. They are picked on a window that ends a month before the last day, so a
  fetch made just after a loss still picks the dark section, and they are kept on later runs.
- `dark-sections.mjs` reports each dark stretch once, by webhook or by failing the run, so GitHub
  sends an email.
- The self-deploy workflow does both by default for GA4.

The section columns are kept out of the change detector itself, because round one showed what
happens when they go in.

This was checked in simulation and against a stand-in for Google's API, not on a live property.
A section that goes dark on purpose, such as a finished campaign, gets reported too. The message
names a lost tag as the usual cause, not the only one. Every number, both rules and the code that
produced them are in the
[README](../../ventures/changepoint-detector/README.md), under "A template-shaped tracking loss".
The tool is free and MIT licensed, and it runs on your own GitHub account; nothing passes
through us.
