---
title: "Checking a league's facility booking request on thousands of random seasons"
seo_title: "League scheduler facility booking request: tested on random leagues"
date: 2026-11-04
tags: [ventures, league-schedule-generator, scheduling, testing]
description: "The multi-division league scheduler writes a per-venue booking request. We fuzzed it on 1,370 random leagues and found no mismatch with the schedule."
---

The multi-division league scheduler can write the request an organiser sends a
facility: for each venue, the nights it is needed, which courts, and the
earliest start to the latest finish. A wrong request means a double-booked or
missing court, so we checked it against the schedule it came from.

A new script, `eval/fuzz-bookings.mjs`, builds random leagues (1 to 4 divisions,
up to 5 courts at up to 3 venues, double rounds, linked teams, split rounds) and
checks four things: every game appears once, no venue-night is listed twice, the
listed courts are the courts actually used, and each time span runs from the
first start to the last start plus the game length.

Over four seeds of 400 leagues, 1,370 leagues were built and 0 faults found. The
rest were refused because the courts and times could not fit the teams. These are
made-up leagues, so the check pins behaviour; a real league's booking request
still needs a facility's reply to prove it is useful.
