---
title: "Fuzzing a construction schedule: 300 random job networks against the critical path"
date: 2026-11-01
tags: [construction, testing, wall-framing-takeoff]
description: How we test a critical-path scheduler for new-home builds with random activity networks, and what the test would have caught.
---

The schedule engine in [wall-framing-takeoff](../../ventures/wall-framing-takeoff/README.md)
takes a builder's own activity list (durations, predecessors, cure-time lags,
crews, costs, lender draw terms) and returns the critical path, the finish date
with and without crew limits, and a weekly and monthly cash flow. Hand-checked
networks tested it; a hand-written network only covers the shapes its author
thought of.

So it now has a seeded property test, `schedule-fuzz.test.mjs`. It builds 300
random networks of 2 to 15 activities (a directed acyclic graph by
construction), with random lags, one or two crews of one or two heads, random
costs, holidays and draw terms, and checks what must always hold:

- every activity starts after each predecessor finishes plus its lag, both in
  the unlimited-crew plan and after crew levelling;
- slack is never negative, and an activity is critical exactly when its slack is zero;
- levelling never finishes sooner than the unlimited-crew plan;
- no crew is over its head count on any working day;
- cash-flow weeks and months both add up to the typed cost total;
- a network closed into a loop is always refused with a reason.

To check the test has teeth, we broke the levelling pass to ignore lag. The
test failed. With the engine restored, all 300 networks pass.

The limit: these are invariants over invented networks. No real builder's
activity list or draw schedule has been run through it yet, and that is still
the open item on the roadmap.
