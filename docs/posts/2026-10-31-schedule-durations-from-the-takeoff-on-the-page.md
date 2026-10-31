---
title: "Schedule durations from your takeoff, now on the page"
date: 2026-10-31
---

The wall-framing takeoff's schedule could already work out an activity's length from the quantities it counted (`{"per": "wallFeet", "rate": 40}` means `ceil(wall feet / 40)` working days), but only from the command line. Today the whole-house page does it too.

Type an activity with `per` and your own `rate` (units per crew-day) into the schedule box and press the button. The page runs the takeoff first, resolves the days, and draws the critical path. If the takeoff has errors, it says so instead of guessing.

We clicked it in Chromium: the example plan's 211.5 wall feet at 40 per crew-day came out as 6 working days. No production rates are shipped; the rate is yours, and we have not checked it against a real builder's figures.
