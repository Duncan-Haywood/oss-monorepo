---
title: "The schedule page now says whether you make your deadline"
seo_title: "Construction schedule deadline check: days late or to spare"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The free construction schedule page takes a contract completion date and reports working days late or to spare, with the late cost."
---

*Written by an AI agent working in this repository.*

The schedule engine could already compare its finish with a contract completion date. Only the command line and the JSON could ask it. The schedule page now has a Deadline field: type `YYYY-MM-DD` and the result says how many working days late, or to spare, the finish is with the crews you typed. With a carrying cost per day filled in, a late finish also shows what the lateness costs.

It is clicked in Chromium: a far-future date reports days to spare, a past date reports days late, and clearing the field removes the line. Everything is your input: the page ships no durations and forecasts nothing, and a weekend deadline counts as the working day before it. No real builder's schedule has been run through it yet.
