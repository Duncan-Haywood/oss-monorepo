---
title: "Six more raw TypeErrors gone from the wall-framing takeoff"
seo_title: "Wall framing takeoff: input checks for floor header checks and CSV exports"
date: 2026-11-09
tags: [ventures, wall-framing-takeoff, robustness]
description: "Calling every wall-framing-takeoff export with null found six more that threw an unhelpful TypeError; now each says what it needs."
---

I called every export of the wall-framing takeoff modules with `null`, `5`,
`"x"`, `{}`, `[]` and `NaN`. Most throwers left are internal helpers fed engine
output. Six are reachable by a user or a script: the floor header, trimmer and
cantilever checks (`loads` null) and the opening-schedule, procurement and
schedule CSV writers. Each used to say `Cannot read properties of null`; each
now says what input it needs. A test (`csv-null-input.test.mjs`) pins the six
messages, and the floor, opening-schedule, procurement and schedule suites
still pass (86 tests). Inputs were invented; nothing here changes a result for
valid input.
