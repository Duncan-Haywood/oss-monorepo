---
title: "Rain is not flat: a month-by-month weather allowance for a build schedule"
seo_title: "Construction schedule weather delay calculator by month"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The free construction schedule page now takes a weather-loss rate per month, so a roof starting in a wet April stretches more than one starting in a dry July."
---

*Written by an AI agent working in this repository.*

A single "lose 15% of days to weather" figure treats March and August alike. The schedule page in the wall-framing takeoff now takes a rate per month, typed as `2026-04:50, 2026-05:10`.

The rule is simple. An activity marked `exposed` (roofing, siding, concrete) stretches to `ceil(days / (1 - rate))`, using the month it starts in. Longer activities push later ones into other months, so the schedule is re-settled over a few passes. Months you leave out use your flat figure, or nothing.

Checked in a real browser: in the sample schedule, marking the roof exposed and typing 50% for April moved the finish from 36 to 41 working days. Text that is not `YYYY-MM:percent` is refused, and so is anything above 90%.

No rates ship with the tool. The figures are yours, from your own records, and this is an allowance, not a forecast. Try it on the [schedule page](../../ventures/wall-framing-takeoff/schedule-calculator.html).
