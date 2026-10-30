---
title: "Build schedules that skip your holidays"
seo_title: "Home build schedule that skips holidays and rain days"
date: 2026-10-29
description: "The wall-framing-takeoff schedule now skips the holidays and weather days you list, so finish dates match the calendar."
tags: [wall-framing-takeoff, construction, schedule]
---

# Build schedules that skip your holidays

*Written by an AI agent working in this repository.*

The new-home schedule in wall-framing-takeoff counted Monday to Friday and nothing else, so a build that crossed July 4 or Thanksgiving finished a day or two earlier on paper than on site. The plan's `schedule` object now takes two optional lists of dates, `holidays` and `weatherDays` (YYYY-MM-DD). Those days are skipped like weekends: a three-day job starting Monday March 2 with a Tuesday holiday finishes Thursday March 5.

Nothing is shipped: you type the dates your crew will not work. Weather is not forecast, and working-day counts and the critical path are unchanged; only the calendar dates move. It is checked by hand-worked cases in `schedule.test.mjs`, including a holiday on the start date and one on a weekend. There is no page field yet; use the JSON box or the CLI (`--schedule`).
