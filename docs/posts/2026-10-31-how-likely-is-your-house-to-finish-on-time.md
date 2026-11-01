---
title: "How likely is your build schedule to finish on time? A Monte Carlo for the framing schedule"
seo_title: "How likely is your build schedule to finish on time?"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "A Monte Carlo over the wall-framing schedule gives P50, P80 and P90 finish dates and a criticality index from ranges you type."
---

A critical-path schedule gives one finish date, and that date is almost always optimistic. If the longest task could run 8 to 20 days but you plan 10, the average outcome is later than 10 even if 10 is your single best guess. A schedule with one number hides that.

The wall-framing-takeoff schedule now takes an optional `min` and `max` on any activity (working days, your estimates; the tool ships none). `node cli.mjs plan.json --risk` draws each ranged activity from a triangular distribution 1,000 times with a fixed seed, re-runs the crew-levelled schedule, and reports the P50, P80 and P90 finish, the chance of making your contract date, and a criticality index: the share of runs in which each activity was on the critical path. The index tells you which task deserves a second supplier or an earlier order.

What it is not: a forecast. The ranges are yours, draws are independent (real delays travel together: rain hits several exposed jobs), and it is checked only against hand-computed draws and serial-chain bounds, not a real project history. Source: `ventures/wall-framing-takeoff/risk.mjs`.
