---
title: "February 30th is no longer March 2nd in the construction schedule"
description: "The wall-framing takeoff's schedule and order-by dates now refuse a calendar day that does not exist instead of quietly reading it as the next month."
date: 2026-11-10
tags: [wall-framing-takeoff, schedule, construction]
---

JavaScript's `Date` reads `2026-02-30` as March 2. The wall-framing takeoff
trusted that: type `--orders=2026-02-30`, or put it (or `2026-04-31`) in a plan's
schedule `start`, `notBefore` or `deadline`, and every order-by date was worked
out from a day that was not the one typed, with no warning.

Each date must now round-trip as a real calendar day, so a typo gets "is not a
date (YYYY-MM-DD)" and a leap day (`2028-02-29`) still passes. Found by running
the command with odd dates by hand; tests cover each field. Inputs were invented.
