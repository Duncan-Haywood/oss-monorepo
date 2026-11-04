---
title: "What happens to the framing schedule when the crew is on another job?"
date: 2026-11-04
description: "The wall-framing schedule page now takes a crew's days off and shows how far the finish date moves."
tags: [wall-framing-takeoff, scheduling, construction]
---

# What happens to the framing schedule when the crew is on another job?

A small framing outfit rarely has a crew to itself. Three days pulled onto
another site in week one can move the whole completion date, because every
later activity waits behind that crew.

The schedule page of wall-framing-takeoff now has a **Crew days off** field.
Type `concrete=2026-03-02 2026-03-03 2026-03-04` and that crew's activities
pause on those days; other crews are untouched. In the page's sample schedule
those three days moved the last date from 2026-04-28 to 2026-05-01. The engine
supported this already; only the command line could reach it.

The dates are your own calendar. The tool ships no durations and no crew
records, and the result is a planning aid, not a promise. It was checked by
clicking the field in Chromium, not against a real builder's schedule.
