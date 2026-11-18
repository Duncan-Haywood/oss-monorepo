---
title: "Counting splash blocks under the downspouts"
seo_title: "Splash block count for gutter downspouts in a framing takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, gutters, takeoff]
description: "The wall framing takeoff can now add one splash block per downspout to the gutter list and the budget."
---

A gutter order that stops at the kick-out elbow leaves the builder to remember what goes under it. The wall framing takeoff now counts splash blocks: set `gutters.splashBlocks: true` and it adds one per downspout, with an optional `splashBlockPrice` that flows into the gutter cost and a "Splash blocks" line in the budget.

It is off by default, so existing plans give the same numbers. On the sample gable roof the four downspouts give four blocks, and a test checks that count and the priced cost (4 x 6 = 24) by hand. Nothing was compared with a real gutter order, and the downspout count itself is still a rule of thumb, not a drainage design.
