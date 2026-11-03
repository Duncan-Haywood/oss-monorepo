---
title: "A one-billion-day activity froze our construction scheduler, so we capped it"
seo_title: "Construction schedule tool: hostile input guards"
date: 2026-11-03
tags: [construction, scheduling, testing, wall-framing-takeoff]
description: "Sweeping every number in a sample construction schedule with hostile values found a hang, a crash and a 21-second date walk. All three now refuse with a reason."
---

The wall-framing-takeoff schedule engine plans crews, lags, holidays and slips for a house build. We turned every numeric field of its sample schedule into text, negative, huge, fractional and null values, then timed what happened.

Three things were wrong:

- An activity with `days: 1000000000` kept the calendar walk running for minutes. The page or command-line tool looked frozen.
- A slip with that many days crashed with `Invalid time value` instead of explaining itself.
- A `notBefore` date of 9999-12-31 took 21 seconds, and a start date in year 1 took 3.

The engine now refuses each with a plain reason. Days, lags and slips must be finite and at most 3650 (ten years of working days). Dates must fall between 1990 and 2100. These are guard limits to keep the tool responsive, not scheduling rules. Tests in `schedule.test.mjs` fail if the guards are removed.

Everything here is checked on invented schedules only; no real builder's activity list has been run through it yet.
