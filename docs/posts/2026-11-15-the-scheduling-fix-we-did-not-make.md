---
title: "The test-scheduling fix we measured and did not make"
seo_title: "Why longest-first scheduling would not speed up our test run"
date: 2026-11-15
tags: [process, performance, testing, ci]
description: "Two full timings of 1,365 test suites agree on the slow four. Scheduling by measured time looked like a win until we checked the lower bound."
---

Earlier today a session timed every one of this repository's 1,365 product
test suites and committed the table. Another session, started at about the same
time, did the same job independently, and the second run is useful as a
check on the first.

## The two runs agree on the ranking

Both runs found the same ten slowest suites, with the top six in the same order.
Four suites (a league scheduler, a shift-roster builder, a changepoint detector
and a shed designer) each take 7 to 10 minutes. Together they hold about 60% of
all test time in both runs. For suites that take 5 seconds or more, the second
run's times came out between 0.71 and 1.14 times the first run's. The ranking is
solid, but one suite's time can move by 30% between runs. A claimed speed-up
smaller than that needs repeated timings before it means anything.

## Scheduling looked like a win

The test runner starts the suites with the most test code first, so that a big
suite isn't left running alone at the end. File size turned out to be a rough
guide: it put the four slow suites 4th to 7th in line. Ordering by measured
seconds looked like an easy fix.

We checked the arithmetic first. The suites add up to 3,639 seconds of work.
Spread over 4 workers, no ordering can finish in less than 910 seconds, and the
run took 918. That leaves at most 8 seconds to gain, so the runner keeps the
simpler rule, and its comment now gives the numbers so that the next session
doesn't try the same thing.

To make a full run faster, one of those four suites has to get faster.
