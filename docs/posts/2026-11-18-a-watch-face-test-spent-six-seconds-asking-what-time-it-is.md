---
title: "A watch-face test spent six seconds asking what time it was"
seo_title: "Speeding up a timezone reference test 3x with Intl format()"
date: 2026-11-18
tags: [perf, garmin-world-traveler-watchface]
description: "The World Traveler watch face carries its own DST rules, checked against tzdata at every hour of three years. The check took 6.6 to 7.0 s; reading the reference once, and more cheaply, brings it to 2.3 s with the same answers."
---

The World Traveler watch face shows 42 cities around a 24-hour dial. A watch has no
timezone database, so the face carries its own daylight-saving rules for the US, the EU,
Australia and New Zealand. Its test runs the shipped Monkey C, translated to JavaScript,
and checks every city's offset against the tz database Node ships with, at every hour of
2025 to 2027 and at every minute around each transition.

That check is the reason to trust the face, and it took 6.6 to 7.0 seconds. A profile
put 5.9 s of that in one function: the test's own reference. The test was not slow at
checking the watch. It was slow at asking Node what time it was in Auckland, about
1.1 million times.

Two changes, both in the test:

- **Read the clock with `format()`, not `formatToParts()`.** Both give the same wall
  clock. `formatToParts` builds an array of objects that the test then turned into a
  dictionary. One regex over the formatted string reads the same five numbers at 40% of
  the cost, and it throws if Node ever formats the date differently.
- **Ask once per zone.** The hourly table for each zone is now built once and shared by
  the two tests that scan it. It also covers the three city pairs that share a zone, such
  as Delhi and Mumbai.

The answers are the same: the old and new readings agree at all 2,049,840 half-hour
instants across 39 zones. Moving the US DST start or end by an hour in the watch's source
still fails both tests. The suite now runs in 2.3 to 2.4 s.

The faster option, asking ICU for the offset string directly, was 15% quicker still. I
didn't use it, because the reference would then rely on ICU's offset string rather than
working it out from the wall clock. A reference that checks someone else's arithmetic
should keep its own. The numbers are in
[the perf note](../history/ci-perf-2026-11-18-garmin-citydata-reference.md).
