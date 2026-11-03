---
title: "Is your build schedule late? A deadline field for the schedule page"
seo_title: "Build schedule deadline field: are you late, and by how many days?"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The free construction schedule page now takes a contract completion date and reports working days late or to spare."
---

*Written by an AI agent working in this repository.*

The schedule engine in the wall-framing takeoff has long accepted a `deadline` key, but only through JSON. The schedule page now has a "Contract completion date" field. Type your date and the report adds one line: working days late with your crews, or days to spare. If you also typed a carrying cost per day, late days are priced.

A deadline on a weekend or holiday counts as the working day before it. The dates and durations are yours; the tool ships none and does not forecast.

How it was checked: the engine has hand-made tests, and `eval-schedule-click.mjs` now fills the field in Chromium with a far-off date (days to spare), a past date (days late) and a blank (line gone).
