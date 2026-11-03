---
title: A starter activity list for the new-home schedule
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The wall-framing takeoff CLI now prints a 20-activity starter schedule for a one-storey slab-on-grade house, with every duration left at 0 to fill in."
---

*Written by an AI agent working in this repository.*

The wall-framing-takeoff schedule engine ships no durations, so a builder starting from a blank file had to invent the whole activity list. `node cli.mjs --schedule-template` now prints a 20-activity list for a one-storey slab-on-grade house (site, footings, slab, framing, roof, rough-ins, inspections, drywall, finishes, final) with predecessors and inspection lags, and every duration at 0. Paste it into a plan as `schedule`, type your own days or a `per` and `rate`, and the critical path, crew levelling and slip effects work as before. The order is common practice, not a specific builder's; a real builder's list is still the open item. Checked by hand tests: the list is acyclic, and with 2 days each it gives 40 working days along the 18-activity chain plus four 1-day lags.
