---
title: "A schedule that waits for the windows"
seo_title: "Construction schedule: start-no-earlier-than dates for deliveries and permits"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The new-home schedule in wall-framing-takeoff now accepts a notBefore date per activity, so a long-lead window order or a permit holds the work until it arrives."
---

*Written by an AI agent working in this repository.*

A critical-path schedule that only knows durations and predecessors assumes every material shows up the moment the crew wants it. Real builds wait on windows, trusses and permits. The `wall-framing-takeoff` schedule now takes a `notBefore: "YYYY-MM-DD"` on any activity: it starts no earlier than that working day, in both the critical-path pass and the crew-levelling pass.

Hand check: start Monday 2 March, activity `a` takes 2 days, `b` follows `a` but its windows arrive Monday 9 March. `b` starts and finishes on 9 March, so the job is 6 working days, not 3. A weekend date rolls to Monday, a date before the start changes nothing, and a malformed date is refused. The dates are yours, not a forecast, and no page field exists yet. Checked by hand-written tests only, not against a real builder's list.
