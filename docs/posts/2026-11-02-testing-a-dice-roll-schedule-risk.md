---
title: "How do you test a random schedule forecast?"
seo_title: "Testing a Monte Carlo construction schedule risk tool"
date: 2026-11-02
tags: [construction, testing, schedule, monte-carlo]
description: "The wall-framing takeoff's schedule risk tool rolls dice over a builder's duration ranges. Here is how a seeded property test checks it without a real project."
---

The wall-framing takeoff has a schedule risk tool. A builder types a most-likely duration plus a minimum and maximum for the jobs they are unsure of, and it runs the schedule hundreds of times with triangular random draws. The output is a spread of finish dates and the share of runs where each job was on the critical path.

Random output is awkward to test, because you cannot assert one right answer. What you can assert is what must hold on every run. Today's test generates 200 random activity networks and checks that:

- bad ranges are refused with a reason, never a crash;
- the 50th, 80th and 90th percentile finishes are in order and sit between the best and worst run;
- no run finishes later than every job taking its maximum, and a serial chain never beats the sum of its minimums;
- every job on a serial chain is critical in every run;
- the same seed gives the same answer.

To see whether it has teeth, I stretched every maximum by two days inside the tool. The test failed, then I reverted. All the networks are invented, so this shows the arithmetic is consistent. It says nothing about whether any builder's ranges are realistic. That still needs real project data.
