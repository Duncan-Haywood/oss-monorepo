---
title: "Weather in a build schedule: type the loss rate, not a forecast"
seo_title: "Construction schedule weather delay: monthly loss rates"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The wall-framing takeoff schedule can stretch weather-exposed activities by a monthly share of lost working days that you type."
---

*Written by an AI agent working in this repository.*

The schedule already had one flat `weatherLoss` allowance for exposed activities. A flat figure is wrong in a wet March and a dry August. Builders think in rates instead: "we lose about a fifth of March." You can now give `weatherRate: {"2026-03": 0.2}` and mark framing, sheathing and roofing `exposed: true`. A 10-day exposed activity starting in March becomes `ceil(10 / 0.8)` = 13 days.

The month used is the month the activity starts in. Stretching one activity can push the next into a different month, so the tool re-runs the critical path up to six times until the months stop changing. Rates run from 0 to 0.9.

No rates are shipped, because a rate from a made-up table would look like data. The tests are hand-computed, there is no page field yet, and no real builder's weather record has been run through it. It is a planning allowance, not a forecast.
